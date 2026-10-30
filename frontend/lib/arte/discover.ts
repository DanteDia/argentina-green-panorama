import type { ArteProfile } from "./types";

export interface GNode { id: string; name: string; kind: string; text: string }
export interface GEdge { source: string; target: string }
export interface DiscoverCtx { profile: ArteProfile; myNodeId: string | null; follows: string[]; nodes: GNode[]; edges: GEdge[] }
export interface Affine { nodeId: string; name: string; kind: string; reasons: string[]; score: number }

const VENUES = new Set(["galeria", "museo", "institucion", "fundacion", "programa"]);
const KIND_LABEL: Record<string, string> = { galeria: "galería", museo: "museo", institucion: "institución", fundacion: "fundación", programa: "programa" };
const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

function index(ctx: DiscoverCtx) {
  const byId = new Map(ctx.nodes.map((n) => [n.id, n]));
  const nb = new Map<string, Set<string>>();
  for (const e of ctx.edges) {
    if (!nb.has(e.source)) nb.set(e.source, new Set());
    if (!nb.has(e.target)) nb.set(e.target, new Set());
    nb.get(e.source)!.add(e.target);
    nb.get(e.target)!.add(e.source);
  }
  const themes = ctx.profile.themes.map(norm).filter((t) => t.length >= 4);
  const sharedThemes = (n: GNode) => { const t = norm(n.text); return ctx.profile.themes.filter((_, i) => themes[i] && t.includes(themes[i])); };
  return { byId, nb, sharedThemes, follows: new Set(ctx.follows), mine: ctx.myNodeId ? nb.get(ctx.myNodeId) ?? new Set<string>() : new Set<string>() };
}

const done = (xs: Affine[]) => xs.filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

/** Artists close to you: followed on Instagram > same venues > shared themes. */
export function affineArtists(ctx: DiscoverCtx): Affine[] {
  const { byId, nb, sharedThemes, follows, mine } = index(ctx);
  return done(ctx.nodes.filter((n) => n.kind === "artista" && n.id !== ctx.myNodeId).map((n) => {
    const reasons: string[] = [];
    let score = 0;
    if (follows.has(n.id)) { score += 50; reasons.push("lo seguís en Instagram"); }
    const venues = [...(nb.get(n.id) ?? [])].filter((v) => mine.has(v) && VENUES.has(byId.get(v)?.kind ?? ""));
    for (const v of venues.slice(0, 3)) { const x = byId.get(v)!; score += 15; reasons.push(`comparten ${KIND_LABEL[x.kind]} ${x.name}`); }
    const t = sharedThemes(n);
    if (t.length) { score += 5 * t.length; reasons.push(`temas en común: ${t.join(", ")}`); }
    return { nodeId: n.id, name: n.name, kind: n.kind, reasons, score };
  }));
}

/** Venues to approach: where artists you follow show, minus the ones you already work with. */
export function affineVenues(ctx: DiscoverCtx): Affine[] {
  const { nb, sharedThemes, follows, mine } = index(ctx);
  return done(ctx.nodes.filter((n) => VENUES.has(n.kind) && !mine.has(n.id)).map((n) => {
    const reasons: string[] = [];
    let score = 0;
    if (follows.has(n.id)) { score += 30; reasons.push("la seguís en Instagram"); }
    const seguidos = [...(nb.get(n.id) ?? [])].filter((a) => follows.has(a)).length;
    if (seguidos) { score += 10 * seguidos; reasons.unshift(`expuso${seguidos > 1 ? "n" : ""} ${seguidos} artista${seguidos > 1 ? "s" : ""} que seguís`); }
    const t = sharedThemes(n);
    if (t.length) { score += 3 * t.length; reasons.push(`temas en común: ${t.join(", ")}`); }
    return { nodeId: n.id, name: n.name, kind: n.kind, reasons, score };
  }));
}
