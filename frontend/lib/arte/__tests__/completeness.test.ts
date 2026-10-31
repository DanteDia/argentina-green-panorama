import { describe, expect, it } from "vitest";
import { completeness } from "../completeness";
import type { ArteProfile, ArteWork, CvItem, TextSet } from "../types";

const base: ArteProfile = {
  user_id: "u", node_id: null, name: "", slug: null, birth_year: null, birth_place: null, base_city: null,
  nationality: "AR", residence: "AR", website: null, instagram: null, email_public: null, mediums: [], themes: [],
  career_stage: "emerging", monthly_budget: 2, portfolio_public: false, onboarded_at: null,
};
const obra = (i: number, extra: Partial<ArteWork> = {}): ArteWork => ({
  id: `w${i}`, user_id: "u", title: `Obra ${i}`, year: "2025", technique: "Óleo sobre tela", dimensions: "100 x 80 cm",
  series: null, description: "Texto de la obra", images: [`u/works/${i}.jpg`], sort: i, public: false, ...extra,
});
const cv = (kind: CvItem["kind"]): CvItem => ({ id: kind, user_id: "u", kind, title: "x", org: "y", city: null, country: null, year: "2024", link: null, source: "manual", confirmed: true });

describe("completeness", () => {
  it("an empty profile scores low and asks for works first", () => {
    const r = completeness(base, [], [], {});
    expect(r.score).toBeLessThanOrEqual(10);
    expect(r.missing[0]).toMatch(/obras/i);
  });

  it("a complete profile scores at least 90", () => {
    const texts: TextSet = { statement: { es: "S", en: "S" }, bio_short: { es: "B", en: "B" }, bio_long: { es: "L" } };
    const p = { ...base, name: "Dante Arola", birth_year: 1993, base_city: "Buenos Aires", website: "https://x", instagram: "x", mediums: ["instalación"], themes: ["identidad"] };
    const r = completeness(p, Array.from({ length: 10 }, (_, i) => obra(i)), [cv("education"), cv("group"), cv("prize")], texts);
    expect(r.score).toBeGreaterThanOrEqual(90);
  });

  it("counts works without technical sheet data", () => {
    const works = [obra(1), obra(2, { dimensions: null }), obra(3, { technique: null, dimensions: null })];
    const r = completeness({ ...base, name: "X" }, works, [], {});
    expect(r.missing).toContain("fichas técnicas (2 obras sin técnica o medidas)");
  });

  it("asks for the English short bio when only Spanish exists", () => {
    const r = completeness({ ...base, name: "X" }, [obra(1)], [], { bio_short: { es: "Hola" } });
    expect(r.missing).toContain("bio corta en inglés");
  });
});
