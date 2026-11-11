import { describe, expect, it } from "vitest";
import { checkEligibility } from "../eligibility";
import { matchesSearch, needsStatement, rankPrograms, scoreProgram, type MatchContext } from "../match";
import { tier } from "../tiers";
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
    const recurrente = programa({ id: "r", closes_at: null, window_text: "anual; convocatoria ~jun–ago" });
    const r = rankPrograms(ctx(), [cerrada, recurrente]);
    expect(r.map((x) => x.program.id)).toEqual(["r"]);
    expect(r[0].reasons.join(" ")).toMatch(/agendar/);
  });

  it("a yearly call near its usual window outranks the same call when its window is far, and says why", () => {
    const cerca = programa({ id: "cerca", closes_at: "2026-03-09", window_text: "anual; convocatoria ~ene–mar" });
    const lejos = programa({ id: "lejos", closes_at: "2026-08-09", window_text: "anual; convocatoria ~jun–ago" });
    const r = rankPrograms(ctx(), [lejos, cerca]);
    expect(r.map((x) => x.program.id)).toEqual(["cerca", "lejos"]);
    expect(r[0].reasons.join(" ")).toMatch(/calendario habitual/);
  });

  // Acéfala opened its Manglar programme while the artist was showing at Acéfala, and the tool ranked it like any other call
  describe("calls run by a space the artist already knows", () => {
    const manglar = programa({ id: "manglar", name: "Programa Manglar", organizer: "Acéfala Galería", type: "Formación", closes_at: "2026-12-06" });
    const base = scoreProgram(ctx(), manglar).score;

    it("a space from their CV raises the score and is named as the reason", () => {
      const r = scoreProgram(ctx({ cv: [{ id: "1", user_id: "u", kind: "group", year: "2026", title: "Frecuencias Híbridas", org: "Acéfala Galería", city: null, country: null, link: null, source: "manual", confirmed: true }] }), manglar);
      expect(r.score).toBe(base + 10);
      expect(r.reasons.join(" ")).toMatch(/Acéfala Galería.*tu escena/);
    });

    it("names only the organiser the artist knows, not the whole line", () => {
      const braque = programa({ id: "b", organizer: "UNTREF / MUNTREF + Instituto Francés de Argentina" });
      expect(scoreProgram(ctx({ sceneNames: new Set(["MUNTREF"]) }), braque).reasons.join(" ")).toContain("La organiza MUNTREF, que ya");
    });

    it("an unconfirmed CV line does not count", () => {
      const cv = [{ id: "1", user_id: "u", kind: "group" as const, year: "2026", title: "x", org: "Acéfala Galería", city: null, country: null, link: null, source: "import" as const, confirmed: false }];
      expect(scoreProgram(ctx({ cv }), manglar).score).toBe(base);
    });

    it("a space whose own name has a comma or is very short still matches itself", () => {
      for (const name of ["Nilo, galpón de arte", "NN Galería", "Jorge Mara - La Ruche"]) {
        const p = programa({ id: "x", organizer: name });
        expect(scoreProgram(ctx({ sceneNames: new Set([name]) }), p).score, name).toBe(scoreProgram(ctx(), p).score + 10);
      }
    });

    it("one shared word is not enough when the kinds of space differ", () => {
      const cases: [string, string][] = [
        ["Universidad del Cine", "Ayuntamiento de El Sauzal, Fundación Cine+Cómics"],
        ["Universidad Nacional de las Artes", "Museo Nacional de Arte"],
        ["Museo de Arte Contemporáneo", "Centro de Arte Contemporáneo"],
      ];
      for (const [known, organizer] of cases) {
        const p = programa({ id: "x", organizer });
        expect(scoreProgram(ctx({ sceneNames: new Set([known]) }), p).score, `${known} / ${organizer}`).toBe(scoreProgram(ctx(), p).score);
      }
      const proa = programa({ id: "p", organizer: "Fundación Proa" });
      expect(scoreProgram(ctx({ sceneNames: new Set(["Proa"]) }), proa).score).toBe(scoreProgram(ctx(), proa).score + 10);
    });

    it("a name contained in a longer organiser is someone else", () => {
      const cases: [string, string][] = [
        ["La Nación", "Palais de Glace — Secretaría de Cultura de la Nación"],
        ["Centro Cultural", "Centro Cultural Recoleta"],
        ["Museo de Arte Moderno", "Museo de Arte Moderno de Bogotá"],
        ["Buenos Aires", "Azcuy + Museo de Arte Moderno de Buenos Aires"],
        ["Guggenheim", "John Simon Guggenheim Memorial Foundation"],
      ];
      for (const [known, organizer] of cases) {
        const p = programa({ id: "x", organizer });
        expect(scoreProgram(ctx({ sceneNames: new Set([known]) }), p).score, `${known} / ${organizer}`).toBe(scoreProgram(ctx(), p).score);
      }
    });

    it("a space they follow or are linked to in the scene map counts too, however the organiser line is written", () => {
      const braque = programa({ id: "b", organizer: "UNTREF / MUNTREF + Instituto Francés de Argentina" });
      expect(scoreProgram(ctx({ sceneNames: new Set(["MUNTREF"]) }), braque).score).toBe(scoreProgram(ctx(), braque).score + 10);
      expect(scoreProgram(ctx({ sceneNames: new Set(["acefala"]) }), manglar).score).toBe(base + 10);
    });

    it("needs a whole, distinctive name: 'Arte' does not match 'Fundación arteba' nor 'Arte al Día'", () => {
      const p = programa({ id: "a", organizer: "Fundación arteba" });
      const q = programa({ id: "q", organizer: "Arte al Día" });
      expect(scoreProgram(ctx({ sceneNames: new Set(["Arte", "Fundación"]) }), p).score).toBe(scoreProgram(ctx(), p).score);
      expect(scoreProgram(ctx({ sceneNames: new Set(["Arte"]) }), q).score).toBe(scoreProgram(ctx(), q).score);
    });

    it("shares its 10 points with 'artists like you went through it': knowing the scene is counted once", () => {
      const p = programa({ id: "m2", organizer: "Acéfala Galería", closes_at: "2026-12-06", type: "Formación", alumni_node_ids: ["n1"] });
      const both = scoreProgram(ctx({ sceneNames: new Set(["Acéfala Galería"]), similarArtistNodeIds: new Set(["n1"]) }), p).score;
      expect(both).toBe(scoreProgram(ctx(), { ...p, alumni_node_ids: [] }).score + 10);
    });
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

describe("what a residency costs", () => {
  const residencia = (cost: "funded" | "free" | "low" | null) => programa({ id: `r-${cost}`, type: "Residencia", closes_at: "2026-12-20", cost });

  it("a residency that pays the artist ranks above a free one, and a free one above one with a fee", () => {
    const [paga, gratis, cobra] = (["funded", "free", "low"] as const).map((c) => scoreProgram(ctx(), residencia(c)).score);
    expect(paga).toBeGreaterThan(gratis);
    expect(gratis).toBeGreaterThan(cobra);
  });

  it("says why: the stay is paid for, or costs nothing", () => {
    expect(scoreProgram(ctx(), residencia("funded")).reasons.join(" ")).toMatch(/apoyo económico/);
    expect(scoreProgram(ctx(), residencia("free")).reasons.join(" ")).toMatch(/sin costo/i);
  });

  it("a call that does not state its cost scores like one with a fee: nothing is assumed", () => {
    expect(scoreProgram(ctx(), residencia(null)).score).toBe(scoreProgram(ctx(), residencia("low")).score);
  });

  it("the residencies artists dream of count as international references", () => {
    for (const [name, org] of [["MacDowell Fellowship", "MacDowell"], ["Pro Helvetia — Residencias en Suiza", "Pro Helvetia"], ["Arts at CERN — Residencias", "CERN"], ["Yaddo", "Yaddo"]])
      expect(tier(name, org)).toBe("A");
    expect(tier("Residencia en un pueblo", "Casa Rural")).toBe("C");
  });
});

describe("reference programmes stay on top of bulk listings", () => {
  const stipend = programa({ id: "aca-x", name: "Lakeside Artist Residency", organizer: "Lakeside Arts", type: "Residencia", closes_at: "2026-12-20", cost: "funded" });
  const stipendAfin = { ...stipend, id: "aca-y", description: "A residency about identidad." };

  it("an international reference prize that opens soon outranks an unknown residency that is open, pays a stipend and even shares a theme with the artist", () => {
    const ars = programa({ id: "ars", name: "Prix Ars Electronica", organizer: "Ars Electronica", type: "Premio", closes_at: "2026-03-09", window_text: "anual; convocatoria ~ene–mar" });
    expect(scoreProgram(ctx(), ars).score).toBeGreaterThan(scoreProgram(ctx(), stipendAfin).score);
  });

  it("an open programme of an Argentine reference space outranks it when the fit is the same (affinity can still tip it)", () => {
    const klemm = programa({ id: "klemm", name: "Premio Klemm", organizer: "Fundación Federico Jorge Klemm", type: "Premio", closes_at: "2026-12-06" });
    expect(scoreProgram(ctx(), klemm).score).toBeGreaterThan(scoreProgram(ctx(), stipend).score);
  });

  it("the score never passes 100", () => {
    const todo = programa({ id: "mac", name: "MacDowell Fellowship", organizer: "MacDowell", type: "Residencia", closes_at: "2026-12-20", cost: "funded", digital_focus: true,
      discipline: "Artes Visuales · Arte y tecnología", description: "identidad verificación facial cuerpo máquina dato materia umbral", alumni_node_ids: ["n1"] });
    expect(scoreProgram(ctx({ similarArtistNodeIds: new Set(["n1"]) }), todo).score).toBeLessThanOrEqual(100);
  });
});

describe("tier names do not catch look-alikes", () => {
  it.each([["Residencia de fotografía documental", "Casa Rural"], ["Kemiönsaari Artist Residency", "Saarinen Studio"], ["Studio in Venice for rent", "Venezia Contemporanea"],
    ["Pivot Art Residency", "Pivot"], ["Call for Artistic Director", "Centro Cultural de Belém"], ["Salón de Otoño", "Museo de Arte Moderno de Bogotá"]])("%s is not a reference", (name, org) => {
    expect(tier(name, org)).toBe("C");
  });

  it.each([["Saari Residence", "Kone Foundation", "A"], ["documenta 16 open call", null, "A"], ["Pivô Pesquisa", "Pivô", "A"], ["Premio", "Museo de Arte Moderno de Buenos Aires", "B"],
    ["Convocatoria", "Centro Cultural Recoleta", "B"]])("%s by %s is tier %s", (name, org, t) => {
    expect(tier(name, org)).toBe(t);
  });
});

describe("searching opportunities", () => {
  const p = programa({ name: "Hangar — Residencias", organizer: null, country: "España", benefit: "Estipendio mensual", description: null });

  it("finds a country however it is typed", () => {
    expect(matchesSearch(p, "espana")).toBe(true);
    expect(matchesSearch(p, "ESPAÑA")).toBe(true);
    expect(matchesSearch(programa({ country: "EE.UU. (abierto internacional)" }), "eeuu")).toBe(true);
    expect(matchesSearch(programa({ country: "EE.UU." }), "estados unidos")).toBe(true);
  });

  it("matches what the programme offers, and not the word null for empty fields", () => {
    expect(matchesSearch(p, "estipendio")).toBe(true);
    expect(matchesSearch(p, "null")).toBe(false);
    expect(matchesSearch(p, "japon")).toBe(false);
  });
});
