// "Pegá tu CV": turns a CV pasted as free text (from a Word file, a PDF, a website) into CV items the artist reviews.
// Pure: the model call is injected. The model's answer is untrusted, so readCvItems validates every field.
import { CV_KINDS } from "./cv";
import type { CvKind } from "./types";
import type { Complete } from "./writer";

export interface CvDraftItem { kind: CvKind; title: string; org: string | null; city: string | null; country: string | null; year: string | null }

const KINDS = new Set<string>(CV_KINDS.map(([k]) => k));
const MAX_ITEMS = 80;
export const MAX_CHARS = 12000;   // of pasted text sent to the model; the box says so when a paste is longer
const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export function readCvItems(raw: string): CvDraftItem[] {
  const start = raw.indexOf("[");
  if (start < 0) return [];
  let list: unknown;
  try { list = JSON.parse(raw.slice(start, raw.lastIndexOf("]") + 1)); } catch {
    // a long CV can hit the output limit mid-entry: keep everything up to the last complete one
    try { list = JSON.parse(`${raw.slice(start, raw.lastIndexOf("}") + 1)}]`); } catch { return []; }
  }
  if (!Array.isArray(list)) return [];
  const out: CvDraftItem[] = [];
  for (const x of list as Record<string, unknown>[]) {
    const title = str(x?.title, 200);
    if (!title || typeof x.kind !== "string" || !KINDS.has(x.kind)) continue;
    const year = String(x.year ?? "").match(/(19|20)\d{2}/)?.[0] ?? null;   // "2019-2021" -> the year it started
    out.push({ kind: x.kind as CvKind, title, org: str(x.org, 200), city: str(x.city, 80), country: str(x.country, 80), year });
    if (out.length === MAX_ITEMS) break;
  }
  return out;
}

const SYSTEM = `Ordenás el CV de un artista visual. Devolvé SOLO un array JSON; cada elemento: {"kind","title","org","city","country","year"}.
kind es uno de: ${CV_KINDS.map(([k, l]) => `"${k}" (${l})`).join(", ")}.
title: nombre de la muestra, premio, beca, residencia, carrera o nota. org: institución o espacio. year: cuatro dígitos (el de inicio si es un rango).
Incluí solo lo que está escrito en el texto: no inventes ni completes datos que falten (usá null). Ignorá datos de contacto y textos de bio o statement.`;

/** Items read from a pasted CV. Empty list for an empty paste; null when there is no AI, so the UI can say so. */
export async function parseCv(text: string, complete: Complete): Promise<CvDraftItem[] | null> {
  if (!text.trim()) return [];
  const out = await complete(text.trim().slice(0, MAX_CHARS), { system: SYSTEM, maxTokens: 6000 });
  return out === null ? null : readCvItems(out);
}

/** Same entry, however it was typed. The year is part of it: a salon or prize won in 2019 and 2023 is two lines. */
export const cvKey = (c: { kind: string; title: string; year?: string | null }) => `${c.kind}|${c.title.trim().toLowerCase()}|${c.year ?? ""}`;

/** The items the CV does not have yet, each once. */
export function newCvItems(items: CvDraftItem[], existing: { kind: string; title: string; year?: string | null }[]): CvDraftItem[] {
  const seen = new Set(existing.map(cvKey));
  return items.filter((c) => !seen.has(cvKey(c)) && seen.add(cvKey(c)));
}
