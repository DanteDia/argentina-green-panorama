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

    const participantIds = participants.map((p) => p.node_id);

    if (participantIds.length === 0) {
      return NextResponse.json({ nodes: [], edges: [] });
    }

    // Fetch edges where at least ONE side is a participant
    const { data: allEdges, error: edgesErr } = await supabase
      .from("edges")
      .select("*")
      .or(`source_id.in.(${participantIds.join(",")}),target_id.in.(${participantIds.join(",")})`);

    if (edgesErr) {
      // Fallback: only edges between participants
      const { data: fallbackEdges } = await supabase
        .from("edges")
        .select("*")
        .in("source_id", participantIds)
        .in("target_id", participantIds);

      const edges = fallbackEdges || [];
      const { data: nodes } = await supabase.from("nodes").select("*").in("id", participantIds);

      const participantMeta = Object.fromEntries(
        participants.map((p) => [p.node_id, { role: p.role, sponsor_tier: p.sponsor_tier }])
      );

      return NextResponse.json({
        nodes: (nodes || []).map((n) => formatNode(n, participantMeta, true)),
        edges: edges.map(formatEdge),
      });
    }

    const edges = allEdges || [];

    // Collect all node IDs referenced by edges
    const participantSet = new Set(participantIds);
    const connectedIds = new Set<string>();
    for (const e of edges) {
      if (!participantSet.has(e.source_id)) connectedIds.add(e.source_id);
      if (!participantSet.has(e.target_id)) connectedIds.add(e.target_id);
    }

    // Fetch all needed nodes (participants + connected)
    const allNodeIds = [...participantIds, ...connectedIds];
    const { data: nodes, error: nodesErr } = await supabase
      .from("nodes")
      .select("*")
      .in("id", allNodeIds);

    if (nodesErr || !nodes) {
      return NextResponse.json({ error: "Failed to load nodes" }, { status: 500 });
    }

    // Build participant metadata lookup
    const participantMeta = Object.fromEntries(
      participants.map((p) => [p.node_id, { role: p.role, sponsor_tier: p.sponsor_tier }])
    );

    return NextResponse.json({
      nodes: nodes.map((n) => formatNode(n, participantMeta, participantSet.has(n.id))),
      edges: edges.map(formatEdge),
    });
  } catch (err) {
    console.error("Event graph error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function formatNode(
  n: Record<string, unknown>,
  participantMeta: Record<string, { role: string; sponsor_tier: string }>,
  isParticipant: boolean
) {
  return {
    id: n.id,
    nombre: n.nombre,
    link: n.link,
    followers: n.followers,
    cluster: n.cluster,
    categoria: n.categoria,
    quien_fondea: n.quien_fondea || "",
    aliados_portfolio: (n.aliados_portfolio as string[]) || [],
    clientes: (n.clientes as string[]) || [],
    descripcion: n.descripcion,
    logo_url: n.logo_url,
    verified: n.verified || false,
    verification_tx: n.verification_tx,
    verification_attempts: n.verification_attempts || 0,
    verification_status: n.verification_status || "unverified",
    verification_failure_reason: n.verification_failure_reason || null,
    verification_details: n.verification_details || {},
    source: n.source || "manual",
    // Event-specific
    is_participant: isParticipant,
    event_role: participantMeta[n.id as string]?.role,
    event_sponsor_tier: participantMeta[n.id as string]?.sponsor_tier,
  };
}

function formatEdge(e: Record<string, unknown>) {
  return {
    id: e.id,
    source_id: e.source_id,
    target_id: e.target_id,
    relationship_type: e.relationship_type,
    description: e.description || "",
    confidence: e.confidence || 1.0,
    source: e.source || "manual",
  };
}
