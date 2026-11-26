// The public pages of the art scene map (/arte/escena): a space's or a person's relationships, named from their side.
// Instagram tags and press mentions are left out: they say someone posted together, not that they work together.

type Edge = { source_id: string; target_id: string; relationship_type: string };
export type Section = { title: string; items: { id: string; name: string }[] };

// [type, title when the page's node is the source, title when it is the target], in the order they are shown
const TYPES: [string, string, string][] = [
  ["representado_por", "Representado por", "Representa a"],
  ["expuso_en", "Expuso en", "Expusieron acá"],
  ["en_coleccion_de", "En la colección de", "Obra en su colección"],
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
  ["miembro_comite_adquisiciones", "Comité de adquisiciones de", "Comité de adquisiciones"],
  ["jurado_de", "Jurado de", "Jurados"],
  ["adquirio_obra_de", "Adquirió obra de", "Coleccionistas de su obra"],
  ["vendio_obra_de", "Vendió obra de", "Vendieron su obra"],
  ["dono_a", "Donó a", "Donaciones de"],
  ["es_titular_de", "Titular de", "Titular"],
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
