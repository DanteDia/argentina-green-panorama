import type { Program } from "./types";

export type StateLabel = "abierta" | "cierra hoy" | "próxima" | "cerrada" | "recurrente";
/** `projected`: the timing is estimated from past editions, not announced by the organiser. */
export interface ProgramState { label: StateLabel; daysLeft?: number; text: string; projected?: boolean }

const TZ = "America/Argentina/Buenos_Aires";

/** Calendar day (YYYY-MM-DD) in Buenos Aires for an instant. */
export function todayAR(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);

export function formatDay(d: string): string {
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
// A month is its Spanish name or three-letter form standing alone: "abre", "marítimo" and "Mar del Plata" are not months
const M = "ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sep(?:t|tiembre)?|set(?:iembre)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?";
const MES = `(?<!\\p{L})(${M})(?!\\p{L})(?!\\s+del\\b)`;
const RANGO = new RegExp(`${MES}\\.?\\s*(?:[–—/-]|al?|y|hasta)\\s*${MES}`, "u"), UN_MES = new RegExp(MES, "u");
const mes = (s: string) => MESES.findIndex((m) => m.startsWith(s.slice(0, 3).replace("set", "sep"))) + 1;
const pad = (n: number) => String(n).padStart(2, "0");
// Which part of a window text is about applying. "inicio marzo" or "finalistas anunciados en mayo" are not.
const CALL = /convoc|inscrip|postul|cierr|abre|aplic|recep/, NOT_CALL = /inicio|comienz|finalist|selecci|resultad|entrega|inaugur|muestra|residencia|anunci|cursada/;
const NOT_YEARLY = /bienal|trienal|bianual|cada dos años/;
/** A recurring call this close to its usual window is shown as coming up, so there is time to prepare it. */
const SOON_DAYS = 90;
/** Usual windows are approximate ("~"): one that would close this soon after an edition already held is that same edition. */
const SAME_EDITION_DAYS = 180;

/**
 * Next time a yearly call's usual window comes round, read from text like "anual; convocatoria ~ene–mar": the range of
 * months (or the single month, `single`) in the part of the text that talks about applying. Estimates: opens on the
 * 1st, closes on the 28th. `lastClose` is the closing date of an edition already held. Null when the text names no
 * month for applying or the call is not yearly.
 */
export function nextWindow(text: string | null, today: string, lastClose?: string | null): { opens: string; closes: string; single: boolean } | null {
  const t = (text || "").toLowerCase();
  if (NOT_YEARLY.test(t)) return null;
  const parts = t.split(/[;(]/).filter((c) => UN_MES.test(c));
  const part = parts.find((c) => CALL.test(c)) ?? parts.find((c) => !NOT_CALL.test(c));
  const r = part?.match(RANGO) || part?.match(UN_MES);
  if (!r) return null;
  const from = mes(r[1]), to = mes(r[2] ?? r[1]);
  const y = Number(today.slice(0, 4));
  for (const year of [y - 1, y, y + 1, y + 2]) {
    const opens = `${year}-${pad(from)}-01`;
    const closes = `${to < from ? year + 1 : year}-${pad(to)}-28`;
    if (closes >= today && (!lastClose || dayDiff(lastClose, closes) >= SAME_EDITION_DAYS)) return { opens, closes, single: !r[2] };
  }
  return null;
}

/** The day an application is due: only an announced closing date still ahead, never a past edition's or an estimate. */
export const dueDate = (p: Pick<Program, "closes_at">, today: string): string | null => (p.closes_at && p.closes_at >= today ? p.closes_at : null);

/** A recurring call near its usual window, or null when the window is unknown or still far. Never says it is open. */
function nearWindow(p: Program, today: string, last: string | null): ProgramState | null {
  const w = nextWindow(p.window_text, today, last);
  if (!w) return null;
  // the source text is always shown: the reading of it is ours, and "cierre ~sep" is not "opens in September"
  if (w.opens <= today) {
    return { label: "próxima", projected: true, text: `${w.single ? "Su convocatoria suele ser" : "Suele estar abierta"} en esta época (${p.window_text}) · confirmá la fecha en su sitio` };
  }
  if (dayDiff(today, w.opens) > SOON_DAYS) return null;
  const month = MESES[Number(w.opens.slice(5, 7)) - 1];
  const lastText = last ? ` · la última cerró el ${formatDay(last)}${last.slice(0, 4) === today.slice(0, 4) ? "" : ` de ${last.slice(0, 4)}`}` : "";
  return { label: "próxima", projected: true, text: `${w.single ? "Su convocatoria suele ser" : "Suele abrir"} en ${month} (${p.window_text})${lastText} · fecha a confirmar` };
}

/** Where a call stands today. Unknown dates are never guessed: a recurring call reads 'recurrente', or 'próxima' (projected) near its usual window. */
export function programState(p: Program, now: Date): ProgramState {
  const today = todayAR(now);
  if (!p.closes_at) {
    if (p.opens_at && p.opens_at > today) return { label: "próxima", text: `Abre el ${formatDay(p.opens_at)} · cierre a confirmar` };
    return nearWindow(p, today, null) ?? { label: "recurrente", text: p.window_text ? `Recurrente · ventana típica: ${p.window_text}` : "Recurrente · fecha a confirmar" };
  }
  if (p.closes_at < today) {
    return nearWindow(p, today, p.closes_at) ?? (p.window_text
      ? { label: "recurrente", text: `Cerró el ${formatDay(p.closes_at)} · vuelve: ${p.window_text}` }
      : { label: "cerrada", text: `Cerró el ${formatDay(p.closes_at)}` });
  }
  if (p.opens_at && p.opens_at > today) {
    return { label: "próxima", daysLeft: dayDiff(today, p.closes_at), text: `Abre el ${formatDay(p.opens_at)} · cierra el ${formatDay(p.closes_at)}` };
  }
  if (p.closes_at === today) return { label: "cierra hoy", daysLeft: 0, text: "Cierra hoy" };
  const d = dayDiff(today, p.closes_at);
  if (d > 270) return { label: "recurrente", text: `Fecha a confirmar (la fuente indica ${formatDay(p.closes_at)} de ${p.closes_at.slice(0, 4)})` };
  return { label: "abierta", daysLeft: d, text: d === 1 ? "Cierra mañana" : `Cierra en ${d} días · ${formatDay(p.closes_at)}` };
}
