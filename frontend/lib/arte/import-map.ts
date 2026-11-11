import type { ArteProfile, CvItem, CvKind } from "./types";

export interface IgProfile { username: string; full_name?: string; biography?: string; external_url?: string; public_email?: string; follower_count?: number; pk?: string | number }
export interface SiteImport { url: string; text: string; images: string[]; pages: string[] }
export interface GraphEdgeImport { relationship_type: string; target_nombre: string; target_tipo: string; fecha: string | null }
export interface GraphNodeImport {
  id: string; nombre: string; descripcion: string | null; link: string | null;
  extra: { nacimiento?: string; lugar_nacimiento?: string; vive_en?: string };
  contact_info: { instagram?: string; email?: string };
  edges: GraphEdgeImport[];
}
export interface IgPost { code: string; caption: string; image: string; year: string | null }
export interface DraftWork { title: string; image_url: string; source: string; description?: string; year?: string | null }
export interface DraftProfile {
  profile: Partial<ArteProfile>;
  texts: { bio_short?: string; bio_long?: string; statement?: string };
  cv: (Pick<CvItem, "kind" | "title" | "org" | "year" | "source"> & { evidence?: string })[];
  works: DraftWork[];
  graphNodeId: string | null;
  /** The artist already has works: they are bringing more, so nothing is preselected and they land back on Obras. */
  returning?: boolean;
  /** Instagram numeric id, so the page can ask for the artist's follows in the background after the draft is shown. */
  igPk?: string;
  warnings: string[];
  sources: string[];
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

function kindFor(e: GraphEdgeImport): CvKind | null {
  const t = e.target_nombre.toLowerCase();
  switch (e.relationship_type) {
    case "expuso_en": case "participa_en": case "mencionado_con": return "group";
    case "premiado_en": return /beca|grant|fellowship|fondo/.test(t) ? "grant" : "prize";
    case "participo_en": return /bienal|biennial|biennale|documenta|manifesta/.test(t) ? "group" : "residency";
    case "en_coleccion_de": return "collection";
    case "formado_en": return "education";
    default: return null;
  }
}

/** Longest coherent passage of the site text (a bio, usually), capped. */
function bioFromSite(text: string): string | undefined {
  const parrafos = text.split(/\n{2,}|(?<=\.)\s{2,}/).map((p) => p.replace(/\s+/g, " ").trim()).filter((p) => p.length > 80 && /[a-záéíóú]{4,}/.test(p));
  const best = parrafos.sort((a, b) => b.length - a.length)[0] || (text.replace(/\s+/g, " ").trim().length > 80 ? text.replace(/\s+/g, " ").trim() : undefined);
  return best?.slice(0, 1600);
}

/** The artist's recent posts from the media API: first slide of a carousel, the largest image up to ~1100px, caption and year. */
export function igPosts(items: unknown[]): IgPost[] {
  type Cand = { url?: string; width?: number };
  type Media = { code?: string; taken_at?: number; caption?: { text?: string } | string | null; image_versions2?: { candidates?: Cand[] }; carousel_media?: Media[]; media?: Media };
  const out: IgPost[] = [];
  for (const it of items as Media[]) {
    const m = it?.media ?? it;
    const cands = [...((m?.carousel_media?.[0] ?? m)?.image_versions2?.candidates ?? [])].filter((c) => c.url).sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
    const best = (cands.filter((c) => (c.width ?? 0) <= 1100).pop() ?? cands.pop())?.url;
    if (!m?.code || !best) continue;
    const caption = typeof m.caption === "string" ? m.caption : m.caption?.text ?? "";
    out.push({ code: m.code, caption, image: best, year: m.taken_at ? String(new Date(m.taken_at * 1000).getUTCFullYear()) : null });
  }
  return out;
}

/** Rows for arte_follows: one per account. The API repeats accounts across pages, and a repeated key fails the whole upsert. */
export function followRows(userId: string, follows: { username: string; full_name?: string }[], nodeByHandle: Map<string, string>) {
  const seen = new Map<string, { user_id: string; handle: string; full_name: string | null; node_id: string | null }>();
  for (const f of follows) {
    const handle = f.username.toLowerCase();
    if (!seen.has(handle)) seen.set(handle, { user_id: userId, handle, full_name: f.full_name ?? null, node_id: nodeByHandle.get(handle) ?? null });
  }
  return [...seen.values()];
}

/** Where an imported work came from, stored on the work so importing again never duplicates it. An Instagram post is
 *  identified by its code (its image urls are signed and change); a website image by its address. */
export const workOrigin = (w: DraftWork) => (w.source.startsWith("instagram.com/p/") ? `ig:${w.source.slice("instagram.com/p/".length)}` : `url:${w.image_url}`).slice(0, 400);

/** Draft works that this artist has not imported yet. */
export const newDraftWorks = (works: DraftWork[], imported: (string | null)[]) => { const have = new Set(imported); return works.filter((w) => !have.has(workOrigin(w))); };

/** Truncate by characters, not UTF-16 units: half an emoji is an invalid string that Postgres rejects. */
export const cut = (t: string, n: number) => (t.length <= n ? t : [...t].slice(0, n).join(""));

/** A caption's first line with words as a work title: no hashtags, no leading emoji, not a paragraph. */
function titleFromCaption(caption: string): string {
  const line = caption.split("\n").map((l) => l.replace(/#\S+/g, "").replace(/^[^\p{L}\p{N}"“¿¡]+/u, "").trim()).find((l) => /\p{L}/u.test(l)) ?? "";
  return !line ? "Obra sin título" : [...line].length <= 80 ? line : `${cut(line, 77).trimEnd()}…`;
}

/** Merge what we could read (graph > site > Instagram) into a draft the artist confirms item by item. */
export function mapImport(input: { ig?: IgProfile | { error: string }; site?: SiteImport | { error: string }; graphNode?: GraphNodeImport | null; posts?: IgPost[] }): DraftProfile {
  const d: DraftProfile = { profile: {}, texts: {}, cv: [], works: [], graphNodeId: null, warnings: [], sources: [] };
  const ig = input.ig && !("error" in input.ig) ? input.ig : null;
  const site = input.site && !("error" in input.site) ? input.site : null;
  if (input.ig && "error" in input.ig) d.warnings.push(`No pude leer tu Instagram (${input.ig.error}). Podés completar a mano.`);
  if (input.site && "error" in input.site) d.warnings.push(`No pude leer tu web (${input.site.error}).`);

  const g = input.graphNode;
  if (g) {
    d.graphNodeId = g.id;
    d.sources.push("Mapa de la escena (IndustriesVerified · Arte)");
    d.profile.name = g.nombre;
    if (g.extra.nacimiento) d.profile.birth_year = Number(g.extra.nacimiento) || undefined;
    if (g.extra.lugar_nacimiento) d.profile.birth_place = g.extra.lugar_nacimiento;
    if (g.extra.vive_en) d.profile.base_city = g.extra.vive_en.split(/,| y /)[0].trim();
    if (g.link) d.profile.website = g.link;
    if (g.contact_info.instagram) d.profile.instagram = g.contact_info.instagram;
    if (g.descripcion && g.descripcion.length > 60) d.texts.bio_long = g.descripcion;
    const vistos = new Set<string>();
    for (const e of g.edges) {
      const kind = kindFor(e);
      const key = `${kind}|${e.target_nombre}`;
      if (!kind || vistos.has(key)) continue;
      vistos.add(key);
      d.cv.push({ kind, title: e.target_nombre, org: e.target_nombre, year: e.fecha ? e.fecha.slice(0, 4) : null, source: "graph" });
    }
  }
  // Instagram posts first: that is where an emerging artist's work actually lives, already captioned
  d.works.push(...(input.posts ?? []).map((p) => ({ title: titleFromCaption(p.caption), description: cut(p.caption, 1500) || undefined, year: p.year, image_url: p.image, source: `instagram.com/p/${p.code}` })));
  if (site) {
    d.sources.push(site.url);
    d.profile.website = d.profile.website || site.url;
    const bio = bioFromSite(site.text);
    if (bio && (!d.texts.bio_long || bio.length > d.texts.bio_long.length)) d.texts.bio_long = bio;
    d.works.push(...site.images.slice(0, 24).map((u) => ({ title: "Obra sin título", image_url: u, source: site.url })));
  }
  if (ig) {
    d.sources.push(`instagram.com/${ig.username}`);
    d.profile.instagram = ig.username;
    if (ig.pk) d.igPk = String(ig.pk);
    if (ig.full_name && !d.profile.name) d.profile.name = ig.full_name;
    if (ig.external_url && !d.profile.website) d.profile.website = ig.external_url;
    const email = ig.public_email || ig.biography?.match(EMAIL)?.[0];
    if (email) d.profile.email_public = email;
  }
  return d;
}
