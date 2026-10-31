import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ArteProfile, CvItem } from "./types";
import type { DiscoverCtx, GEdge, GNode } from "./discover";

type NodeRow = { id: string; nombre: string; categoria: string; descripcion: string | null; link: string | null };
const COLS = "id, nombre, categoria, descripcion, link";
const unescape = (s: string | null) => s?.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&") ?? null;
const chunks = <T,>(xs: T[], n = 200) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

async function edgesTouching(supabase: SupabaseClient, ids: string[]): Promise<GEdge[]> {
  const out: GEdge[] = [];
  for (const c of chunks(ids)) {
    const list = c.join(",");
    // ponytail: one page of 1000 per chunk; enough for a neighborhood, paginate if hubs get bigger
    const { data } = await supabase.from("edges").select("source_id, target_id").or(`source_id.in.(${list}),target_id.in.(${list})`).limit(1000);
    out.push(...(data || []).map((e) => ({ source: e.source_id, target: e.target_id })));
  }
  return out;
}

/** The artist's neighborhood of the scene graph: who they follow, where they showed, two hops out, and theme matches. */
export async function loadDiscover(supabase: SupabaseClient, userId: string, profile: ArteProfile, cv: CvItem[]): Promise<DiscoverCtx & { rows: Map<string, NodeRow> }> {
  const { data: f } = await supabase.from("arte_follows").select("node_id").eq("user_id", userId).not("node_id", "is", null);
  const follows = [...new Set((f || []).map((x) => x.node_id as string))];

  const orgs = [...new Set(cv.map((c) => c.org).filter((o): o is string => !!o))].slice(0, 100);
  const { data: cvVenues } = orgs.length ? await supabase.from("nodes").select("id").contains("industries", ["arte"]).in("nombre", orgs) : { data: [] };
  const seeds = [...new Set([...(profile.node_id ? [profile.node_id] : []), ...follows, ...(cvVenues || []).map((v) => v.id)])];

  const hop1 = await edgesTouching(supabase, seeds);
  const near = [...new Set(hop1.flatMap((e) => [e.source, e.target]))];
  const hop2 = near.length ? await edgesTouching(supabase, near.slice(0, 600)) : [];

  const themes = profile.themes.filter((t) => t.length >= 4).slice(0, 6);
  const { data: themed } = themes.length
    ? await supabase.from("nodes").select(COLS).contains("industries", ["arte"]).or(themes.map((t) => `descripcion.ilike.%${t.replace(/[,()%]/g, "")}%`).join(",")).limit(400)
    : { data: [] };

  const rows = new Map<string, NodeRow>(((themed || []) as NodeRow[]).map((n) => [n.id, { ...n, descripcion: unescape(n.descripcion) }]));
  const ids = [...new Set([...seeds, ...near, ...hop2.flatMap((e) => [e.source, e.target])])].filter((id) => !rows.has(id)).slice(0, 4000);
  for (const c of chunks(ids)) {
    const { data } = await supabase.from("nodes").select(COLS).in("id", c);
    for (const n of (data || []) as NodeRow[]) rows.set(n.id, { ...n, descripcion: unescape(n.descripcion) });
  }
  // The artist's own CV venues count as "theirs" even without a graph node: attach them to a virtual self
  const me = profile.node_id ?? `me:${userId}`;
  const edges = [...hop1, ...hop2, ...(cvVenues || []).map((v) => ({ source: me, target: v.id }))];
  const nodes: GNode[] = [...rows.values()].map((n) => ({ id: n.id, name: n.nombre, kind: n.categoria, text: n.descripcion ?? "" }));
  if (!profile.node_id) nodes.push({ id: me, name: profile.name, kind: "artista", text: "" });
  return { profile, myNodeId: me, follows, nodes, edges, rows };
}
