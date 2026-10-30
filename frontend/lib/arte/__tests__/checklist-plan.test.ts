import { describe, expect, it } from "vitest";
import { buildChecklist } from "../checklist";
import { seasonPlan } from "../plan";
import type { Ranked } from "../match";
import { programa } from "./fixtures";
import { programState } from "../dates";

const NOW = new Date("2026-11-01T13:00:00Z");
const r = (id: string, closes_at: string | null, score: number, window_text: string | null = null): Ranked => {
  const program = programa({ id, closes_at, window_text });
  return { program, score, reasons: [], effortDays: 4, state: programState(program, NOW), eligibilityNotes: [] };
};

describe("buildChecklist", () => {
  it("turns requirements into concrete steps with lead times", () => {
    const items = buildChecklist({ letter: true, cv: true, images_n: 10, fee: { amount: 30, currency: "USD" } }, []);
    const labels = items.map((i) => i.label);
    expect(labels).toContain("Carta de motivación");
    expect(labels).toContain("CV");
    expect(labels).toContain("Seleccionar 10 obras con ficha");
    expect(labels).toContain("Pagar inscripción (30 USD)");
    expect(labels.at(-1)).toBe("Enviar postulación");
    expect(items.find((i) => i.label === "Carta de motivación")!.due_offset_days).toBeGreaterThan(items.find((i) => i.label === "CV")!.due_offset_days);
  });

  it("starts with profile gaps the application will need", () => {
    const items = buildChecklist({ letter: true }, ["statement", "bio corta"]);
    expect(items[0].label).toBe("Completar perfil: statement");
  });

  it("unknown requirements still give a sensible minimal checklist", () => {
    const labels = buildChecklist({}, []).map((i) => i.label);
    expect(labels[0]).toBe("Leer las bases oficiales");
    expect(labels).toContain("Enviar postulación");
  });
});

describe("seasonPlan", () => {
  it("never schedules more deadlines in a month than the artist's budget", () => {
    const ranked = [r("a", "2026-11-10", 90), r("b", "2026-11-12", 80), r("c", "2026-11-20", 70), r("d", "2026-12-05", 60)];
    const plan = seasonPlan(ranked, 2, NOW);
    const nov = plan.find((m) => m.month === "2026-11")!;
    expect(nov.items.map((i) => i.programId)).toEqual(["a", "b"]);
    expect(plan.find((m) => m.month === "2026-12")!.items.map((i) => i.programId)).toEqual(["d"]);
  });

  it("projects recurring programs into their next window, flagged as projected", () => {
    const plan = seasonPlan([r("ars", null, 85, "anual; convocatoria ~ene–mar")], 2, NOW);
    const item = plan.flatMap((m) => m.items).find((i) => i.programId === "ars")!;
    expect(item.projected).toBe(true);
    expect(item.deadline.startsWith("2027-03")).toBe(true);
  });

  it("prep start is before the deadline", () => {
    const item = seasonPlan([r("a", "2026-11-25", 90)], 2, NOW)[0].items[0];
    expect(item.prepStart < item.deadline).toBe(true);
  });
});
