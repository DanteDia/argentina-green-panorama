import type { ArteProfile } from "./types";

export interface GNode { id: string; name: string; kind: string; text: string }
export interface GEdge { source: string; target: string }
export interface DiscoverCtx { profile: ArteProfile; myNodeId: string | null; follows: string[]; nodes: GNode[]; edges: GEdge[] }
export interface Affine { nodeId: string; name: string; kind: string; reasons: string[]; score: number }

export const VENUES = new Set(["galeria", "museo", "institucion", "fundacion", "programa"]);
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

const PEOPLE = new Set(["persona", "curador", "coleccionista", "gestor"]);
const FOLLOW_IS_ENOUGH = new Set(["curador", "coleccionista", "gestor"]); // "persona" also holds celebrities you happen to follow

/** People to invite (curators, collectors, managers): tied to your spaces or to artists you follow. */
export function affinePeople(ctx: DiscoverCtx): Affine[] {
  const { byId, nb, follows, mine } = index(ctx);
  return done(ctx.nodes.filter((n) => PEOPLE.has(n.kind) && n.id !== ctx.myNodeId).map((n) => {
    const reasons: string[] = [];
    let score = 0;
    const around = [...(nb.get(n.id) ?? [])];
    for (const v of around.filter((v) => mine.has(v) && VENUES.has(byId.get(v)?.kind ?? "")).slice(0, 2)) {
      const x = byId.get(v)!; score += 20; reasons.push(`vínculo con ${KIND_LABEL[x.kind]} ${x.name}`);
    }
    const artists = around.filter((a) => follows.has(a) && byId.get(a)?.kind === "artista").length;
    if (artists) { score += 8 * artists; reasons.push(`conexión con ${artists} artista${artists > 1 ? "s" : ""} que seguís`); }
    if (follows.has(n.id) && (score > 0 || FOLLOW_IS_ENOUGH.has(n.kind))) { score += 25; reasons.unshift("seguís a esta persona en Instagram"); }
    return { nodeId: n.id, name: n.name, kind: n.kind, reasons, score };
  }));
}

/** Spaces you already showed at or worked with: the warmest guests for your own opening. */
export function yourVenues(ctx: DiscoverCtx): Affine[] {
  const { byId, mine } = index(ctx);
  return done([...mine].map((id) => byId.get(id)).filter((n): n is GNode => !!n && VENUES.has(n.kind))
    .map((n) => ({ nodeId: n.id, name: n.name, kind: n.kind, reasons: [`ya trabajaste con ${n.kind === "museo" || n.kind === "programa" ? "este" : "esta"} ${KIND_LABEL[n.kind]}`], score: 60 })));
}

// Signatures of text scraped from a page's chrome instead of written about the person. Measured on the scene graph's
// ~3,000 descriptions: most are short Instagram-style bios ("Arquitecto. Artista visual. Tucumán"), so anything not flagged stays.
const SCRAPE = /ir al contenido|saltar al contenido|alternar la navegaci|skip to (?:the |main )?content|skip to main|(?:top|bottom) of page|javascript|arteinformado|wikipedia|english version|cookies|lorem ipsum|duis aute|archiv(?:os|es) -|-->|⟶|<<|<\/?\w+>|<\s*click/i;
const MENU = new Set(["inicio", "home", "menu", "obra", "obras", "works", "bio", "biografia", "cv", "statement", "contacto", "contact", "about", "exhibitions", "prensa", "press", "enlaces", "news", "tienda", "shop"]);
const isMenu = (t: string) => {
  const w = t.split(/\s+/);
  const labels = w.filter((x) => MENU.has(x.normalize("NFD").replace(/[\u0300-\u036f]|[^\p{L}]/gu, "").toLowerCase())).length;
  return labels >= 3 || /(?:\b\p{Lu}{3,}\b\s+){3}\p{Lu}{3,}/u.test(t);   // three menu labels, or a run of four shouted words
};

/** One line about a person or space for a card: their own Instagram bio first, else the stored description unless it is page chrome. */
export function sceneBlurb(descripcion: string | null, contact: { ig_bio?: string } | null | undefined): string | null {
  const bio = contact?.ig_bio?.split("\n").map((l) => l.replace(/^[^\p{L}\p{N}@#]+/u, "").trim()).filter(Boolean).join(" · ");
  if (bio) return bio;
  const d = descripcion?.trim();
  return d && !SCRAPE.test(d) && !isMenu(d) ? d : null;
}
