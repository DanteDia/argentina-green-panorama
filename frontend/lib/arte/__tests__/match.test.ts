import { describe, expect, it } from "vitest";
import { checkEligibility } from "../eligibility";
import { rankPrograms, scoreProgram, type MatchContext } from "../match";
import { perfil, programa } from "./fixtures";

const NOW = new Date("2026-11-01T13:00:00Z");
const ctx = (o: Partial<MatchContext> = {}): MatchContext => ({
  profile: perfil(), works: [], cv: [], statement: "Investigo el umbral donde la materia se vuelve dato: identidad, verificación facial, el cuerpo frente a la máquina.",
  appliedProgramIds: new Set(), similarArtistNodeIds: new Set(), now: NOW, ...o,
});

describe("checkEligibility", () => {
  it("excludes by age with a reason that says so", () => {
    const r = checkEligibility(perfil({ birth_year: 1985 }), programa({ eligibility: { age_max: 35 } }), NOW);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/edad/);
  });

  it("an Argentine artist is eligible for a Latin American call", () => {
    expect(checkEligibility(perfil(), programa({ eligibility: { nationality: ["LATAM"] } }), NOW).ok).toBe(true);
  });

  it("calls restricted to another nationality are not eligible", () => {
    expect(checkEligibility(perfil(), programa({ for_argentines: "restringido a otra nacionalidad" }), NOW).ok).toBe(false);
  });

  it("unknown birth year does not exclude, but asks to confirm age", () => {
    const r = checkEligibility(perfil({ birth_year: null }), programa({ eligibility: { age_max: 35 } }), NOW);
    expect(r.ok).toBe(true);
    expect(r.reasons.join(" ")).toMatch(/confirm/i);
  });
});

describe("ranking", () => {
  const tecnosis = programa({ id: "hangar", name: "Hangar — Residencias", type: "Residencia", digital_focus: true, discipline: "Artes Visuales · Arte y tecnología",
    description: "Convocatoria Tecnosis: arte y tecnología, inteligencia artificial y datos.", closes_at: "2026-11-22" });
  const novela = programa({ id: "alfaguara", name: "Premio Alfaguara de Novela", type: "Premio", discipline: "Literatura", description: "Premio a novela inédita.", closes_at: "2026-11-02" });

  it("a digital artist sees the art-and-technology residency above a novel prize", () => {
    const r = rankPrograms(ctx(), [novela, tecnosis]);
    expect(r[0].program.id).toBe("hangar");
    expect(r[0].reasons.join(" ")).toMatch(/tecnolog/i);
  });

  it("an empty profile still gets ranked results and a nudge to complete the statement", () => {
    const empty = ctx({ profile: perfil({ mediums: [], themes: [] }), statement: "" });
    const r = rankPrograms(empty, [tecnosis, novela]);
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].reasons.join(" ")).toMatch(/completá tu statement/i);
  });

  it("already-applied programs are not recommended again", () => {
    const r = rankPrograms(ctx({ appliedProgramIds: new Set(["hangar"]) }), [tecnosis, novela]);
    expect(r.find((x) => x.program.id === "hangar")).toBeUndefined();
  });

  it("closed non-recurring calls are left out; recurring ones stay as 'para agendar'", () => {
    const cerrada = programa({ id: "c", closes_at: "2026-03-01", window_text: null });
    const recurrente = programa({ id: "r", closes_at: null, window_text: "anual; convocatoria ~ene–mar" });
    const r = rankPrograms(ctx(), [cerrada, recurrente]);
    expect(r.map((x) => x.program.id)).toEqual(["r"]);
    expect(r[0].reasons.join(" ")).toMatch(/agendar/);
  });

  it("artists similar to you who went through the program raise its score", () => {
    const p = programa({ alumni_node_ids: ["n1"] });
    const sin = scoreProgram(ctx(), p).score;
    const con = scoreProgram(ctx({ similarArtistNodeIds: new Set(["n1"]) }), p);
    expect(con.score).toBeGreaterThan(sin);
    expect(con.reasons.join(" ")).toMatch(/afines/);
  });

  it("estimates more preparation days for a call that asks for a project, budget and video", () => {
    const simple = scoreProgram(ctx(), programa({ requirements: { cv: true } })).effortDays;
    const pesado = scoreProgram(ctx(), programa({ requirements: { cv: true, letter: true, project: true, budget: true, video: true } })).effortDays;
    expect(pesado).toBeGreaterThan(simple);
  });
});
