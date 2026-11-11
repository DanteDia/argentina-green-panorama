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
// whole month names or their three-letter form only: "abre" must not read as April
const MES = "(ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sep(?:tiembre)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?)\\b";
const RANGO = new RegExp(`\\b${MES}\\s*[–-]\\s*${MES}`), UN_MES = new RegExp(`\\b${MES}`);
const mes = (s: string) => MESES.findIndex((m) => m.startsWith(s.slice(0, 3))) + 1;
const pad = (n: number) => String(n).padStart(2, "0");
/** A recurring call this close to its usual window is shown as coming up, so there is time to prepare it. */
const SOON_DAYS = 90;

/**
 * Next time a call's usual window comes round, read from text like "anual; convocatoria ~ene–mar": the first range of
 * months named, or else the first month. Estimates: opens on the 1st, closes on the 28th. `lastClose` is the closing
 * date of an edition already held; the window it fell in is not offered again.
 */
export function nextWindow(text: string | null, today: string, lastClose?: string | null): { opens: string; closes: string } | null {
  const t = (text || "").toLowerCase();
  const r = t.match(RANGO) || t.match(UN_MES);
  if (!r) return null;
  const from = mes(r[1]), to = mes(r[2] ?? r[1]);
  const y = Number(today.slice(0, 4));
  for (const year of [y - 1, y, y + 1, y + 2]) {
    const opens = `${year}-${pad(from)}-01`;
    const closes = `${to < from ? year + 1 : year}-${pad(to)}-28`;
    if (closes >= today && (!lastClose || opens > lastClose)) return { opens, closes };
  }
  return null;
}

/** A recurring call near its usual window, or null when the window is unknown or still far. Never says it is open. */
function nearWindow(p: Program, today: string, last: string | null): ProgramState | null {
  const w = nextWindow(p.window_text, today, last);
  if (!w) return null;
  if (w.opens <= today) {
    return { label: "próxima", projected: true, text: `Suele estar abierta en esta época (${p.window_text}): confirmá la fecha en su sitio` };
  }
  if (dayDiff(today, w.opens) > SOON_DAYS) return null;
  const month = MESES[Number(w.opens.slice(5, 7)) - 1];
  return { label: "próxima", projected: true, text: `Suele abrir en ${month}${last ? ` · la última cerró el ${formatDay(last)}` : ""} · fecha a confirmar` };
}

/** Where a call stands today. Unknown dates are never guessed: a recurring call reads 'recurrente', or 'próxima' (projected) near its usual window. */
export function programState(p: Program, now: Date): ProgramState {
  const today = todayAR(now);
  if (!p.closes_at) {
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
