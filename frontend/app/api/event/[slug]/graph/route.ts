import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  try {
    // Get event participant node IDs
    const { data: participants, error: partErr } = await supabase
      .from("event_participants")
      .select("node_id, role, sponsor_tier")
      .eq("event_slug", slug);

    if (partErr || !participants) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const nodeIds = participants.map((p) => p.node_id);

    if (nodeIds.length === 0) {
      return NextResponse.json({ nodes: [], edges: [] });
    }

    // Fetch all participant nodes
    const { data: nodes, error: nodesErr } = await supabase
      .from("nodes")
      .select("*")
      .in("id", nodeIds);

    if (nodesErr || !nodes) {
      return NextResponse.json({ error: "Failed to load nodes" }, { status: 500 });
    }

    // Fetch edges between participant nodes
    const { data: edges, error: edgesErr } = await supabase
      .from("edges")
      .select("*")
      .in("source_id", nodeIds)
      .in("target_id", nodeIds);

    if (edgesErr || !edges) {
      return NextResponse.json({ error: "Failed to load edges" }, { status: 500 });
    }

    // Build participant metadata lookup
    const participantMeta = Object.fromEntries(
      participants.map((p) => [p.node_id, { role: p.role, sponsor_tier: p.sponsor_tier }])
    );

    return NextResponse.json({
      nodes: nodes.map((n) => ({
        id: n.id,
        nombre: n.nombre,
        link: n.link,
        followers: n.followers,
        cluster: n.cluster,
        categoria: n.categoria,
        quien_fondea: n.quien_fondea || "",
        aliados_portfolio: n.aliados_portfolio || [],
        clientes: n.clientes || [],
        descripcion: n.descripcion,
        logo_url: n.logo_url,
        verified: n.verified || false,
        verification_tx: n.verification_tx,
        verification_attempts: n.verification_attempts || 0,
        verification_status: n.verification_status || "unverified",
        verification_failure_reason: n.verification_failure_reason || null,
        verification_details: n.verification_details || {},
        source: n.source || "manual",
        // Event-specific metadata
        event_role: participantMeta[n.id]?.role,
        event_sponsor_tier: participantMeta[n.id]?.sponsor_tier,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source_id: e.source_id,
        target_id: e.target_id,
        relationship_type: e.relationship_type,
        description: e.description || "",
        confidence: e.confidence || 1.0,
        source: e.source || "manual",
      })),
    });
  } catch (err) {
    console.error("Event graph error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
