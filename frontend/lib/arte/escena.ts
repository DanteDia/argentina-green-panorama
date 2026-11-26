// The public pages of the art scene map (/arte/escena): a space's or a person's relationships, named from their side.
// Instagram tags and press mentions are left out: they say someone posted together, not that they work together.

type Edge = { source_id: string; target_id: string; relationship_type: string };
export type Section = { title: string; items: { id: string; name: string }[] };

// Who buys, owns or donates whose work is private: collectors and those relationships are never on a public page.
// [type, title when the page's node is the source, title when it is the target], in the order they are shown
const TYPES: [string, string, string][] = [
  ["representado_por", "Representado por", "Representa a"],
  ["expuso_en", "Expuso en", "Expusieron acá"],
  ["premiado_en", "Premiado en", "Premiados"],
  ["curo", "Curó", "Curado por"],
  ["organiza", "Organiza", "Organizado por"],
  ["dirige", "Dirige", "Dirigido por"],
  ["fundo", "Fundó", "Fundado por"],
  ["participo_en", "Participó en", "Participaron"],
  ["participa_en", "Participa en", "Participan"],
  ["vende_en", "Vende en", "Venden acá"],
  ["formado_en", "Se formó en", "Se formaron acá"],
  ["trabaja_en", "Trabaja en", "Trabajan acá"],
  ["miembro_de", "Miembro de", "Miembros"],
  ["jurado_de", "Jurado de", "Jurados"],
  ["colabora_con", "Colabora con", "Colabora con"],
  ["escribio_sobre", "Escribió sobre", "Escribieron sobre"],
];

/** The relationship types a public page shows; the query asks only for these. */
export const SHOWN_TYPES = TYPES.map(([t]) => t);

export function relationSections(nodeId: string, edges: Edge[], names: Map<string, string>): Section[] {
  const out: Section[] = [];
  for (const [type, asSource, asTarget] of TYPES) {
    for (const [title, mine, other] of [[asSource, "source_id", "target_id"], [asTarget, "target_id", "source_id"]] as const) {
      const seen = new Set<string>();
      const items = edges
        .filter((e) => e.relationship_type === type && e[mine] === nodeId)
        .map((e) => e[other])
        .filter((id) => names.has(id) && !seen.has(id) && seen.add(id))
        .map((id) => ({ id, name: names.get(id)! }));
      if (items.length) {
        const same = out.find((s) => s.title === title);   // "Colabora con" reads the same from both sides
        if (same) same.items.push(...items.filter((i) => !same.items.some((x) => x.id === i.id)));
        else out.push({ title, items });
      }
    }
  }
  return out;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", uuml: "ü" };

/** Scraped descriptions arrive with HTML entities ("contempor&#225;neo"); React would show them as typed. */
export const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : NAMED[e.toLowerCase()] ?? m);

/** The categories with a public page: spaces, artists and curators. Collectors, media and private people are left out. */
export const PUBLIC_CATEGORIES = ["galeria", "museo", "espacio", "centro_cultural", "fundacion", "institucion", "feria", "escuela", "artista", "curador"];

/** Bios scraped from Instagram carry emails, phones and WhatsApp links: never on a public page. */
const YEAR = /^(19|20)\d\d$/;
// a run of 8+ digits is a phone unless every group in it is a year ("1998-2024 - 2025")
const phone = (m: string) => {
  const groups = m.match(/\d+/g) || [];
  return groups.join("").length >= 8 && !groups.every((g) => YEAR.test(g)) ? "" : m;
};
export const redactContacts = (s: string) =>
  s.replace(/[\w.+-]+\s*(?:@|[[(]\s*(?:at|arroba)\s*[\])])\s*[\w-]+\.[\w.-]+/gi, "")
    .replace(/(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\S*/gi, "")
    .replace(/\+?\(?\d[\d\s().\/-]{5,}\d(?:\s*(?:int\.?|interno)\s*\d+)?/gi, phone)
    .replace(/(^|[^\w@])@[\w.]{2,}/g, "$1")
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/\s{2,}/g, " ").replace(/\s+([,.;:])/g, "$1").trim();

/** A node's link is shown only when it is a web address, never a WhatsApp, phone or mail link. */
export const publicLink = (link: string | null) =>
  link && /^https?:\/\//i.test(link) && !/wa\.me|whatsapp\.com/i.test(link) ? link : null;

export type ContactLine = { label: string; text: string; href?: string };

/** The contact block of a public page (shown by the owner's decision of 2026-11-26, to help the map grow). */
export function contactLines(c: Record<string, unknown> | null | undefined): ContactLine[] {
  if (!c) return [];
  // scraped fields arrive as strings, numbers or lists
  const str = (k: string) => { const v = c[k]; return (Array.isArray(v) ? v.filter((x) => typeof x === "string").join(",") : typeof v === "string" || typeof v === "number" ? String(v) : "").trim(); };
  const out: ContactLine[] = [];
  const mails = [...new Set([str("email"), ...str("emails").split(/[,;\s]+/), str("ig_email")]
    .map((m) => m.toLowerCase().replace(/^mailto:/, "").replace(/[.,;:]+$/, ""))
    .filter((m) => /^[^\s@?&]+@[\w.-]+\.[a-z]{2,}$/i.test(m)))];
  for (const m of mails) out.push({ label: "Mail", text: m, href: `mailto:${m}` });
  const tel = str("telefono");
  if (tel) {
    const first = (tel.split(/[\/,;]| y | o /)[0] || "").replace(/[^\d+]/g, "");   // a field may list several numbers
    out.push({ label: "Teléfono", text: tel, ...(first.replace(/\D/g, "").length >= 6 ? { href: `tel:${first}` } : {}) });
  }
  const ig = str("instagram").replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/\/.*$/, "");
  if (/^[\w.]{1,30}$/.test(ig)) out.push({ label: "Instagram", text: `@${ig}`, href: `https://instagram.com/${ig}` });
  if (str("direccion")) out.push({ label: "Dirección", text: str("direccion") });
  if (str("horarios")) out.push({ label: "Horarios", text: str("horarios") });
  return out;
}
