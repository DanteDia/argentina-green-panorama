import { redirect } from "next/navigation";
import { requireUser } from "@/lib/arte/supabase-server";
import { loadStudio } from "@/lib/arte/data";
import { loadDiscover } from "@/lib/arte/discover-data";
import { affineArtists, affineVenues } from "@/lib/arte/discover";
import { SceneMap, type MapNode } from "@/components/arte/SceneMap";

export default async function Mapa() {
  const { user, supabase } = await requireUser();
  const studio = await loadStudio(supabase, user.id);
  if (!studio.profile) redirect("/arte/onboarding");
  const ctx = await loadDiscover(supabase, user.id, studio.profile, studio.cv);
  const me = ctx.myNodeId!;
  const mine = new Set(ctx.edges.filter((e) => e.source === me || e.target === me).map((e) => (e.source === me ? e.target : e.source)));
  const keep = new Set([me, ...mine, ...affineVenues(ctx).slice(0, 20).map((a) => a.nodeId), ...affineArtists(ctx).slice(0, 40).map((a) => a.nodeId)]);
  const byId = new Map(ctx.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const edges = ctx.edges.filter((e) => keep.has(e.source) && keep.has(e.target) && !seen.has(`${e.source}|${e.target}`) && seen.add(`${e.source}|${e.target}`));
  // Theme-only matches have no edge here; drawing them as loose dots adds noise, Descubrir lists them
  const linked = new Set([me, ...edges.flatMap((e) => [e.source, e.target])]);
  const nodes: MapNode[] = [...keep].filter((id) => byId.has(id) && linked.has(id)).map((id) => {
    const n = byId.get(id)!;
    return { id, name: n.name, cluster: id === me ? "vos" : n.kind === "artista" ? "artista" : "espacio", link: ctx.rows.get(id)?.link ?? null, descripcion: n.text };
  });

  return (
    <div>
      <p className="eyebrow">Mapa</p>
      <h1 className="display mt-2 text-4xl">Tu vecindario en la escena</h1>
      <p className="mt-2 muted">Vos en naranja, los espacios en negro, artistas afines en gris. Tocá un nodo para abrir su sitio.</p>
      {nodes.length > 1 ? <SceneMap nodes={nodes} edges={edges} me={me} /> : <p className="card mt-6 p-6 muted">Todavía no hay suficiente información para dibujar tu mapa. Sumá tu CV o conectá tu Instagram.</p>}
    </div>
  );
}
