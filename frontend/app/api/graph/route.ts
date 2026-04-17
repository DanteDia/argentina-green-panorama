import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import seedData from "@/lib/seed_data.json";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const industriesParam = request.nextUrl.searchParams.get("industries");
  const industries = industriesParam
    ? industriesParam.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  if (supabase) {
    try {
      let nodeQuery = supabase
        .from("nodes")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(2000);

      if (industries && industries.length > 0) {
        // Prefer array-overlap on `industries` when the column exists;
        // fall back to equality on the legacy singular `industry` so the
        // filter keeps working before the backfill migration lands.
        const probe = await supabase.from("nodes").select("industries").limit(1);
        const hasIndustriesColumn = !probe.error;

        if (hasIndustriesColumn) {
          nodeQuery = nodeQuery.overlaps("industries", industries);
        } else {
          nodeQuery = nodeQuery.in("industry", industries);
        }
      }

      const { data: nodes, error: nodesErr } = await nodeQuery;

      if (!nodesErr && nodes) {
        // Always fetch all edges once — filtering via `.in(...)` with hundreds
        // of UUIDs blows past PostgREST's URL limit and silently 414s.
        // Scope in JS when an industries filter was applied.
        const { data: allEdges, error: edgesErr } = await supabase
          .from("edges")
          .select("*")
          .order("created_at", { ascending: true })
          .limit(5000);

        if (edgesErr) {
          throw edgesErr;
        }

        let edges: Array<Record<string, unknown>> = allEdges || [];
        if (industries && industries.length > 0) {
          const nodeIdSet = new Set(nodes.map((n) => n.id));
          edges = edges.filter(
            (e) => nodeIdSet.has(e.source_id) && nodeIdSet.has(e.target_id)
          );
        }

        return NextResponse.json({
          nodes: nodes.map((n) => ({
            id: n.id,
            nombre: n.nombre,
            link: n.link,
            followers: n.followers,
            cluster: n.cluster,
            categoria: n.categoria,
            quien_fondea: n.quien_fondea,
            aliados_portfolio: n.aliados_portfolio || [],
            clientes: n.clientes || [],
            descripcion: n.descripcion,
            logo_url: n.logo_url,
            industries: n.industries || (n.industry ? [n.industry] : ["green"]),
            verified: n.verified || false,
            verification_tx: n.verification_tx,
            verification_attempts: n.verification_attempts || 0,
            verification_status: n.verification_status || "unverified",
            verification_failure_reason: n.verification_failure_reason || null,
            verification_details: n.verification_details || {},
            source: n.source || "manual",
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
      }
    } catch {
      // Fall through to seed data
    }
  }

  // Fallback: static seed data (no industry tagging in seed; treat all as 'green')
  const seedIsGreen = !industries || industries.includes("green");
  if (!seedIsGreen) {
    return NextResponse.json({ nodes: [], edges: [] });
  }

  const nodes = seedData.nodes.map((node, i) => ({
    ...node,
    id: String(i + 1),
    industries: ["green"],
    verified: false,
    verification_tx: null,
    source: "manual" as const,
  }));

  const nameToId: Record<string, string> = {};
  for (const n of nodes) {
    nameToId[n.nombre] = n.id;
  }

  const edges = seedData.edges
    .map((edge, i) => {
      const sourceId = nameToId[edge.source];
      const targetId = nameToId[edge.target];
      if (!sourceId || !targetId) return null;
      return {
        id: String(i + 1),
        source_id: sourceId,
        target_id: targetId,
        relationship_type: edge.type,
        description: edge.description || "",
        confidence: 1.0,
        source: "manual",
      };
    })
    .filter(Boolean);

  return NextResponse.json({ nodes, edges });
}
