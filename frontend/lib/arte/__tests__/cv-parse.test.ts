import { describe, expect, it } from "vitest";
import { cvKey, parseCv, readCvItems } from "../cv-parse";

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

describe("cvKey", () => {
  it("matches the same entry however it was typed", () => {
    expect(cvKey({ kind: "solo", title: " Umbral " })).toBe(cvKey({ kind: "solo", title: "UMBRAL" }));
    expect(cvKey({ kind: "solo", title: "Umbral" })).not.toBe(cvKey({ kind: "group", title: "Umbral" }));
  });
});
