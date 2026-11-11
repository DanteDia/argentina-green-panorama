// AI first drafts of the texts every call asks for (statement, bios), their English versions, and the profile tags.
// Pure: the model call is injected, so callers pass lib/arte/llm `complete` and tests pass a fake.
// Everything is written only from what the artist already loaded plus their own notes; nothing is saved here.
import { CV_KINDS } from "./cv";
import type { ArteProfile, ArteWork, CvItem, TextSet } from "./types";

export type Complete = (prompt: string, opts?: { system?: string; maxTokens?: number }) => Promise<string | null>;
export type WriterKind = "statement" | "bio_short" | "bio_long";
export interface WriterStudio { profile: ArteProfile; works: ArteWork[]; cv: CvItem[]; texts: TextSet }

const BASE = "Escribís textos profesionales para artistas visuales, en español rioplatense neutro. Concreto y sobrio: sin adjetivos grandilocuentes ni frases hechas del mundo del arte. "
  + "Usá solo los datos provistos: no inventes muestras, premios, estudios, fechas ni obras. Si falta un dato, no lo menciones. Devolvé solo el texto, sin título ni comillas.";
const BRIEF: Record<WriterKind, string> = {
  statement: "Escribí el statement del artista: en primera persona, 120-180 palabras, qué investiga su obra, con qué materiales o medios y por qué. Apoyate en sus notas y en las descripciones de sus obras.",
  bio_short: "Escribí la bio corta: en tercera persona, unas 80 palabras, quién es, dónde vive y trabaja, qué hace y lo más relevante de su trayectoria.",
  bio_long: "Escribí la bio larga: en tercera persona, 180-250 palabras, práctica, formación y trayectoria en orden (muestras, premios, residencias) según los datos.",
};

/** The artist's own material as plain lines, the only source the model may use. */
export function facts(s: WriterStudio): string {
  const p = s.profile;
  const kind = (k: string) => CV_KINDS.find(([x]) => x === k)?.[1] ?? k;
  return [
    `Nombre: ${p.name}`,
    p.base_city && `Vive y trabaja en: ${p.base_city}`,
    p.birth_year && `Nació en: ${p.birth_year}${p.birth_place ? `, ${p.birth_place}` : ""}`,
    p.mediums.length > 0 && `Disciplinas: ${p.mediums.join(", ")}`,
    p.themes.length > 0 && `Temas: ${p.themes.join(", ")}`,
    s.works.length > 0 && `Obras:\n${s.works.slice(0, 12).map((w) => `- ${w.title} (${[w.year, w.technique].filter(Boolean).join(", ") || "s/f"})${w.description ? `: ${w.description}` : ""}`).join("\n")}`,
    s.cv.length > 0 && `Trayectoria:\n${s.cv.filter((c) => c.confirmed).slice(0, 25).map((c) => `- ${kind(c.kind)}: ${c.title}${c.org ? ` — ${c.org}` : ""}${c.year ? ` (${c.year})` : ""}`).join("\n")}`,
    s.texts.statement?.es && `Statement actual: ${s.texts.statement.es}`,
    s.texts.bio_short?.es && `Bio corta actual: ${s.texts.bio_short.es}`,
    s.texts.bio_long?.es && `Bio larga actual: ${s.texts.bio_long.es}`,
  ].filter(Boolean).join("\n");
}

const clean = (t: string) => t.replace(/^```\w*\n?|\n?```$/g, "").trim().replace(/^["“]|["”]$/g, "").trim();

/** A first draft in Spanish, from the artist's data and whatever they jotted down (`notes`, may be empty). Null without AI. */
export async function draftText(kind: WriterKind, s: WriterStudio, notes: string, complete: Complete): Promise<string | null> {
  const out = await complete(
    [facts(s), notes.trim() && `Notas del artista (su voz; es lo más importante, respetá sus palabras):\n${notes.trim().slice(0, 4000)}`].filter(Boolean).join("\n\n"),
    { system: `${BASE} ${BRIEF[kind]}`, maxTokens: 700 },
  );
  return out ? clean(out) : null;
}

export async function translateText(text: string, complete: Complete): Promise<string | null> {
  if (!text.trim()) return null;
  const out = await complete(text.trim(), {
    system: "Translate this artist's text into natural, professional English as used in international open calls. Keep names, titles of works and institutions as written. Same person, same length, no additions. Return only the translation.",
    maxTokens: 900,
  });
  return out ? clean(out) : null;
}

export function parseTags(raw: string): { mediums: string[]; themes: string[] } | null {
  try {
    const d = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { mediums?: unknown; themes?: unknown };
    const list = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string").map((x) => x.trim().toLowerCase()).filter(Boolean))].slice(0, 6);
    const tags = { mediums: list(d.mediums), themes: list(d.themes) };
    return tags.mediums.length || tags.themes.length ? tags : null;
  } catch {
    return null;
  }
}

/** Disciplines and themes read from the artist's works and texts, so they don't have to label themselves. */
export async function suggestTags(s: WriterStudio, complete: Complete): Promise<{ mediums: string[]; themes: string[] } | null> {
  const out = await complete(facts(s), {
    system: 'Leé los datos de este artista visual y devolvé SOLO un JSON {"mediums": [...], "themes": [...]}: hasta 4 disciplinas (ej. instalación, fotografía, video, pintura) y hasta 6 temas de su obra, en español, en minúscula, de 1 a 3 palabras cada uno. Solo lo que se desprende de los datos.',
    maxTokens: 200,
  });
  return out ? parseTags(out) : null;
}
