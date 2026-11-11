// Bulk upload: several image files become one work each, so an artist can drop a folder and fill the sheets later.
import { ownPaths } from "./guards";

export const MAX_BULK = 30;
const UNTITLED = { title: "Obra sin título", year: null };

// What a phone or a chat app calls a file. Their date is when the photo was taken or sent, never the work's year.
const APP_NAME = /^(imagen de whatsapp|whatsapp image|captura de pantalla|screen ?shot|captura)\b/i;
const CAMERA_WORD = /^(img|dsc|dscn|dscf|pxl|mvimg|mg|image|imagen|photo|foto|pic|scan|untitled|wa|copy|copia)$/i;
const FULL_DATE = /(?<!\d)(19|20)\d{2}[-_.]?[01]\d[-_.]?[0-3]\d(?!\d)/;
const YEAR = /^(19|20)\d{2}$/;

/** Title and year for a work created from an uploaded file's name. A name someone wrote becomes the title; a machine's doesn't. */
export function workFromFilename(filename: string): { title: string; year: string | null } {
  const base = filename.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/\s*\(\d{1,2}\)\s*$/, "").trim();   // "(1)" is the browser's copy counter
  if (!base || APP_NAME.test(base) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(base)) return UNTITLED;
  const dated = FULL_DATE.test(base);
  // DSC00123, image0, WA0001: cameras glue letters and counters together
  const tokens = base.replace(FULL_DATE, " ").replace(/(\p{L})(\d)/gu, "$1 $2").replace(/(\d)(\p{L})/gu, "$1 $2").split(/[\s_\-().,]+/).filter(Boolean);
  const year = dated ? null : tokens.find((t) => YEAR.test(t)) ?? null;
  // keep words, and a short number that numbers a piece ("Sin título 3"); drop years, counters, pixel sizes ("1920 x 1080") and camera words
  const kept = tokens.filter((t) => !CAMERA_WORD.test(t) && !/^\d{3,}$/.test(t) && !/^x$/i.test(t));
  if (!kept.some((t) => /\p{L}{2,}/u.test(t))) return UNTITLED;
  const title = kept.join(" ");
  return { title: (title[0].toUpperCase() + title.slice(1)).slice(0, 120), year: year && /\d{3,}\s*x\s*\d{3,}/i.test(base) ? null : year };
}

/** What the server accepts from the browser for a bulk upload: images in the artist's own folder, with a sane title and year. */
export function cleanWorkItems(items: unknown[], userId: string): { path: string; title: string; year: string | null }[] {
  const out: { path: string; title: string; year: string | null }[] = [];
  for (const raw of Array.isArray(items) ? items : []) {
    const i = (raw ?? {}) as { path?: unknown; title?: unknown; year?: unknown };
    if (typeof i.path !== "string" || !ownPaths([i.path], userId).length) continue;
    const title = typeof i.title === "string" ? i.title.trim().slice(0, 200) : "";
    out.push({ path: i.path, title: title || UNTITLED.title, year: typeof i.year === "string" && YEAR.test(i.year) ? i.year : null });
    if (out.length === MAX_BULK) break;
  }
  return out;
}
