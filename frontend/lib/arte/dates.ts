import type { Program } from "./types";

export type StateLabel = "abierta" | "cierra hoy" | "próxima" | "cerrada" | "recurrente";
export interface ProgramState { label: StateLabel; daysLeft?: number; text: string }

const TZ = "America/Argentina/Buenos_Aires";

/** Calendar day (YYYY-MM-DD) in Buenos Aires for an instant. */
export function todayAR(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);

export function formatDay(d: string): string {
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));
}

/** Where a call stands today. Unknown dates are never guessed: they read 'recurrente' with the known window or 'fecha a confirmar'. */
export function programState(p: Program, now: Date): ProgramState {
  const today = todayAR(now);
  if (!p.closes_at) {
    return { label: "recurrente", text: p.window_text ? `Recurrente · ventana típica: ${p.window_text}` : "Recurrente · fecha a confirmar" };
  }
  if (p.closes_at < today) {
    return p.window_text
      ? { label: "recurrente", text: `Cerró el ${formatDay(p.closes_at)} · vuelve: ${p.window_text}` }
      : { label: "cerrada", text: `Cerró el ${formatDay(p.closes_at)}` };
  }
  if (p.opens_at && p.opens_at > today) {
    return { label: "próxima", daysLeft: dayDiff(today, p.closes_at), text: `Abre el ${formatDay(p.opens_at)} · cierra el ${formatDay(p.closes_at)}` };
  }
  if (p.closes_at === today) return { label: "cierra hoy", daysLeft: 0, text: "Cierra hoy" };
  const d = dayDiff(today, p.closes_at);
  if (d > 270) return { label: "recurrente", text: `Fecha a confirmar (la fuente indica ${formatDay(p.closes_at)} de ${p.closes_at.slice(0, 4)})` };
  return { label: "abierta", daysLeft: d, text: d === 1 ? "Cierra mañana" : `Cierra en ${d} días · ${formatDay(p.closes_at)}` };
}
