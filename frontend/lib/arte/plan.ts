import { todayAR } from "./dates";
import type { Ranked } from "./match";

export interface PlanItem { programId: string; name: string; prepStart: string; deadline: string; projected: boolean; score: number }
export interface PlanMonth { month: string; items: PlanItem[] }

const MES: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12 };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(Date.parse(s + "T00:00:00Z") + n * 86_400_000));

/** Next occurrence of the last month named in a window like "anual; convocatoria ~ene–mar" (day 28, a safe estimate). */
export function projectWindow(window: string | null, today: string): string | null {
  if (!window) return null;
  const meses = [...window.toLowerCase().matchAll(/\b(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)/g)].map((m) => MES[m[1]]);
  if (!meses.length) return null;
  const mes = meses[meses.length - 1];
  const [y, m] = today.split("-").map(Number);
  const year = mes > m || (mes === m && Number(today.slice(8)) < 28) ? y : y + 1;
  return `${year}-${String(mes).padStart(2, "0")}-28`;
}

/** Greedy season plan: best opportunities first, at most `budgetPerMonth` deadlines per month, next 12 months. */
export function seasonPlan(ranked: Ranked[], budgetPerMonth: number, now: Date): PlanMonth[] {
  const today = todayAR(now);
  const horizon = addDays(today, 366);
  const cand: PlanItem[] = [];
  for (const r of ranked) {
    const projected = r.state.label === "recurrente";
    const deadline = projected ? projectWindow(r.program.window_text, today) : r.program.closes_at;
    if (!deadline || deadline < today || deadline > horizon) continue;
    const ideal = addDays(deadline, -(r.effortDays + 3));
    const prep = ideal > today ? ideal : today;
    cand.push({ programId: r.program.id, name: r.program.name, deadline, prepStart: prep < deadline ? prep : addDays(deadline, -1), projected, score: r.score });
  }
  const months = new Map<string, PlanItem[]>();
  for (const c of cand.sort((a, b) => b.score - a.score)) {
    const k = c.deadline.slice(0, 7);
    const list = months.get(k) || [];
    if (list.length < Math.max(1, budgetPerMonth)) { list.push(c); months.set(k, list); }
  }
  return [...months.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([month, items]) => ({ month, items: items.sort((a, b) => a.deadline.localeCompare(b.deadline)) }));
}
