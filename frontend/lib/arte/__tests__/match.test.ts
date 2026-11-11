import { describe, expect, it } from "vitest";
import { checkEligibility } from "../eligibility";
import { needsStatement, rankPrograms, scoreProgram, type MatchContext } from "../match";
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

  it("an empty profile still gets ranked results, and is told once (not on every card) that a statement sharpens them", () => {
    const empty = ctx({ profile: perfil({ mediums: [], themes: [] }), statement: "" });
    const r = rankPrograms(empty, [programa()]);
    expect(r.length).toBe(1);
    expect(r[0].reasons.join(" ")).not.toMatch(/statement/i);
    expect(needsStatement(empty)).toBe(true);
    expect(needsStatement(ctx())).toBe(false);
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

describe("match reasons", () => {
  it("never calls generic words (artists, project, Argentina, Buenos Aires) a connection with your work", () => {
    const c = ctx({ profile: perfil({ mediums: [], themes: [] }), statement: "I am an artist based in Buenos Aires, Argentina. My projects connect artists across the world through an important platform and development events." });
    const r = scoreProgram(c, programa({ name: "Residency for artists from Argentina", description: "A platform connecting artists and projects across the world, hosted in Buenos Aires. An important event for development." }));
    expect(r.reasons.join(" ")).not.toMatch(/Conecta con tu obra/);
  });

  it("names the real overlap between your statement and the call", () => {
    const r = scoreProgram(ctx(), programa({ description: "Convocatoria sobre identidad y verificación en la era de la máquina." }));
    expect(r.reasons.join(" ")).toMatch(/Conecta con tu obra: .*identidad/);
  });

  it("never names a word that many calls share, and still names a rare one or one the artist declared", () => {
    // 'durante', 'diferentes', 'materiales' are in every call; 'fotografia' is in 6% of them (a real medium, like in the real data)
    const calls = Array.from({ length: 49 }, (_, i) => programa({ id: `p${i}`, name: `Beca ${i}`, description: `Durante la residencia se trabaja con diferentes materiales.${i < 3 ? " Fotografía." : ""}` }));
    const st = "Durante años trabajé con diferentes materiales, sobre todo cerámica esmaltada y fotografía.";
    const rare = programa({ id: "x", name: "Premio de cerámica esmaltada", description: "Durante el premio se exhiben diferentes materiales." });
    const reasons = (c: MatchContext, id: string) => rankPrograms(c, [...calls, rare]).find((r) => r.program.id === id)!.reasons.join(" ");
    const undeclared = ctx({ profile: perfil({ mediums: [], themes: [] }), statement: st });
    expect(reasons(undeclared, "p10")).not.toMatch(/Conecta con tu obra/);
    expect(reasons(undeclared, "x")).toMatch(/Conecta con tu obra: ceramica, esmaltada/);
    expect(reasons(undeclared, "p0")).not.toMatch(/fotografia/);                      // 6% of calls and not declared: counts, but isn't named
    expect(reasons(ctx({ profile: perfil({ mediums: ["fotografía"], themes: [] }), statement: st }), "p0")).toMatch(/Conecta con tu obra: fotografia/);
  });
});
