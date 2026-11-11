import { describe, expect, it } from "vitest";
import { cvKey, newCvItems, parseCv, readCvItems } from "../cv-parse";

const RAW = '```json\n[{"kind":"solo","title":"Umbral","org":"Acéfala Galería","city":"Buenos Aires","country":"Argentina","year":"2026"},'
  + '{"kind":"education","title":"Lic. en Artes Visuales","org":"UNA","year":2019},'
  + '{"kind":"concert","title":"No es de arte"},{"kind":"prize","title":"  "},{"kind":"group","title":"Sin año","year":"s/f"}]\n```';

describe("readCvItems", () => {
  it("keeps valid items, normalises the year, and drops unknown kinds and empty titles", () => {
    expect(readCvItems(RAW)).toEqual([
      { kind: "solo", title: "Umbral", org: "Acéfala Galería", city: "Buenos Aires", country: "Argentina", year: "2026" },
      { kind: "education", title: "Lic. en Artes Visuales", org: "UNA", city: null, country: null, year: "2019" },
      { kind: "group", title: "Sin año", org: null, city: null, country: null, year: null },
    ]);
  });

  it("returns an empty list for anything that is not that JSON", () => {
    expect(readCvItems("no pude leerlo")).toEqual([]);
    expect(readCvItems('{"kind":"solo"}')).toEqual([]);
  });

  it("caps runaway output", () => {
    const many = JSON.stringify(Array.from({ length: 200 }, (_, i) => ({ kind: "group", title: `M ${i}` })));
    expect(readCvItems(many)).toHaveLength(80);
  });
});

describe("parseCv", () => {
  it("sends the pasted CV and asks only for what is written in it", async () => {
    let prompt = "", system = "";
    const items = await parseCv("2026 - Umbral, Acéfala Galería (individual)", async (p, o) => { prompt = p; system = o?.system ?? ""; return RAW; });
    expect(prompt).toContain("Umbral, Acéfala Galería");
    expect(system).toMatch(/no inventes|solo lo que/i);
    expect(items).toHaveLength(3);
  });

  it("does not call the model for an empty paste, and returns null without AI", async () => {
    expect(await parseCv("   ", async () => { throw new Error("called"); })).toEqual([]);
    expect(await parseCv("algo", async () => null)).toBeNull();
  });
});

describe("readCvItems on imperfect output", () => {
  it("keeps the complete entries of an answer cut off mid-way (a long CV hits the output limit)", () => {
    const cut = '[{"kind":"solo","title":"A","year":"2020"},{"kind":"group","title":"B","year":"2021"},{"kind":"prize","title":"C","ye';
    expect(readCvItems(cut).map((c) => c.title)).toEqual(["A", "B"]);
  });
  it("takes the first year of a range and rejects a kind that is not text", () => {
    expect(readCvItems('[{"kind":"education","title":"X","year":"2019-2021"},{"kind":["solo"],"title":"Y"}]'))
      .toEqual([{ kind: "education", title: "X", org: null, city: null, country: null, year: "2019" }]);
  });
});

describe("cvKey / newCvItems", () => {
  const it2019 = { kind: "prize" as const, title: "Salón Nacional", org: null, city: null, country: null, year: "2019" };
  it("matches the same entry however it was typed, and tells editions of a recurring one apart by year", () => {
    expect(cvKey({ kind: "solo", title: " Umbral ", year: "2026" })).toBe(cvKey({ kind: "solo", title: "UMBRAL", year: "2026" }));
    expect(cvKey({ kind: "solo", title: "Umbral", year: null })).not.toBe(cvKey({ kind: "group", title: "Umbral", year: null }));
    expect(cvKey(it2019)).not.toBe(cvKey({ ...it2019, year: "2023" }));
  });
  it("adds what the CV does not have yet, once", () => {
    const out = newCvItems([it2019, { ...it2019, year: "2023" }, { ...it2019, title: "salón nacional" }], [{ kind: "prize", title: "Salón Nacional", year: "2023" }]);
    expect(out).toEqual([it2019]);
  });
});
