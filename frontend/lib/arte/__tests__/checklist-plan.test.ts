import { describe, expect, it } from "vitest";
import { buildChecklist, checklistHref } from "../checklist";
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

  it("a call inside its usual window is planned for that window, not for a later month named in the text", () => {
    const plan = seasonPlan([r("utdt", null, 85, "convocatoria oct–dic; inicio marzo")], 2, NOW);
    const item = plan.flatMap((m) => m.items).find((i) => i.programId === "utdt")!;
    expect(item.projected).toBe(true);
    expect(item.deadline).toBe("2026-12-28");
  });

  it("a recurring call whose edition already closed this season is not planned again for the same window", () => {
    const plan = seasonPlan([r("x", "2026-10-20", 85, "anual; convocatoria oct–dic")], 2, NOW);
    expect(plan.flatMap((m) => m.items)).toEqual([]);
  });

  it("prep start is before the deadline", () => {
    const item = seasonPlan([r("a", "2026-11-25", 90)], 2, NOW)[0].items[0];
    expect(item.prepStart < item.deadline).toBe(true);
  });
});

describe("checklistHref", () => {
  it("sends each step to the place where it gets done", () => {
    const go = (key: string) => checklistHref(key, "app1", "https://bases.example/call");
    expect(go("gap:obras (subí al menos 6 con imagen)")).toBe("/arte/perfil/obras");
    expect(go("gap:fichas técnicas (2 obras sin técnica o medidas)")).toBe("/arte/perfil/obras");
    expect(go("gap:statement")).toBe("/arte/perfil#textos");
    expect(go("gap:bio corta")).toBe("/arte/perfil#textos");
    expect(go("bases")).toBe("https://bases.example/call");
    expect(go("cv")).toBe("/arte/perfil/cv");
    for (const k of ["letter", "works", "portfolio", "export", "statement", "bio"]) expect(go(k)).toBe("/arte/postulaciones/app1/dossier");
  });
  it("has no link for steps done outside the app, or bases without a url", () => {
    expect(checklistHref("send", "app1", "https://x")).toBeNull();
    expect(checklistHref("fee", "app1", "https://x")).toBeNull();
    expect(checklistHref("bases", "app1", null)).toBeNull();
    for (const bad of ["javascript:alert(1)", "www.x.org", "mailto:a@b.c"]) expect(checklistHref("bases", "app1", bad)).toBeNull();
    expect(checklistHref("bases", "app1", "HTTPS://Bases.Example/")).toBe("HTTPS://Bases.Example/");
  });
});

