// "Pegá tu CV": turns a CV pasted as free text (from a Word file, a PDF, a website) into CV items the artist reviews.
// Pure: the model call is injected. The model's answer is untrusted, so readCvItems validates every field.
import { CV_KINDS } from "./cv";
import type { CvKind } from "./types";
import type { Complete } from "./writer";

export interface CvDraftItem { kind: CvKind; title: string; org: string | null; city: string | null; country: string | null; year: string | null }

const KINDS = new Set<string>(CV_KINDS.map(([k]) => k));
const MAX_ITEMS = 80;
const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export function readCvItems(raw: string): CvDraftItem[] {
  let list: unknown;
  try { list = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1)); } catch { return []; }
  if (!Array.isArray(list)) return [];
  const out: CvDraftItem[] = [];
  for (const x of list as Record<string, unknown>[]) {
    const title = str(x?.title, 200);
    if (!title || !KINDS.has(String(x?.kind))) continue;
    const year = String(x.year ?? "").match(/^(19|20)\d{2}$/)?.[0] ?? null;
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
  const out = await complete(text.trim().slice(0, 12000), { system: SYSTEM, maxTokens: 3500 });
  return out === null ? null : readCvItems(out);
}

/** Same entry, however it was typed: used to skip what the CV already has. */
export const cvKey = (c: { kind: string; title: string }) => `${c.kind}|${c.title.trim().toLowerCase()}`;
