import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import seedData from "@/lib/seed_data.json";
import { scopeGraph } from "@/lib/graph-scope";

// PostgREST returns at most 1,000 rows per request: read a table in pages, in parallel once its size is known.
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readAll(table: string, scope: (q: any) => any, columns = "*"): Promise<Row[]> {
  const PAGE = 1000;
  const { count, error } = await scope(supabase!.from(table).select("id", { count: "exact", head: true }));
  if (error) throw error;
  const pages = await Promise.all(Array.from({ length: Math.ceil((count ?? 0) / PAGE) }, (_, i) =>
    scope(supabase!.from(table).select(columns)).order("created_at", { ascending: true }).order("id").range(i * PAGE, i * PAGE + PAGE - 1)));
  const failed = pages.find((r: { error?: unknown }) => r.error);
  if (failed) throw failed.error;
  return pages.flatMap((r: { data?: unknown[] }) => (r.data || []) as Row[]);
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // ?max=N keeps the N most connected nodes of a big cluster (lib/clusters.ts sets it per cluster)
  const max = Number(request.nextUrl.searchParams.get("max")) || undefined;
  const industriesParam = request.nextUrl.searchParams.get("industries");
  const industries = industriesParam
    ? industriesParam.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  if (supabase) {
    try {
      const scoped = industries && industries.length > 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nodesP = readAll("nodes", (q: any) => (scoped ? q.overlaps("industries", industries) : q));
      // every edge is read and scoped in JS: filtering with .in(...) on thousands of UUIDs overflows the URL
      // only what the map shows: the edge's description is an Instagram caption on many art-scene links, cut to 200 below
      const [all, allEdges] = await Promise.all([nodesP, readAll("edges", (q) => q, "id, source_id, target_id, relationship_type, description, confidence, source, created_at")]);
      if (all) {
        const { nodes, edges } = scopeGraph(all as Array<{ id: string } & Row>, allEdges as Array<{ source_id: string; target_id: string } & Row>, max);
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
            description: String(e.description || "").slice(0, 200),
            confidence: e.confidence || 1.0,
            source: e.source || "manual",
          })),
        }, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } });   // the maps change weekly
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
