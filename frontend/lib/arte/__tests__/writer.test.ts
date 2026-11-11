import { describe, expect, it } from "vitest";
import { draftText, facts, parseTags, suggestTags, translateText } from "../writer";
import { perfil } from "./fixtures";
import type { ArteWork, CvItem } from "../types";

const work = { id: "w", user_id: "u", title: "Umbral", year: "2025", technique: "Fotogrametría", dimensions: null, series: null, description: "Un rostro reconstruido a partir de datos.", images: [], sort: 0, public: false } as ArteWork;
const cv = { id: "c", user_id: "u", kind: "group", title: "Liminales Expandidas", org: "Acéfala Galería", city: null, country: null, year: "2026", link: null, source: "manual", confirmed: true } as CvItem;
const studio = { profile: perfil({ name: "Dante Arola", base_city: "Buenos Aires", mediums: ["instalación"], themes: ["identidad"] }), works: [work], cv: [cv], texts: { bio_long: { es: "Bio vieja." } } };

describe("facts", () => {
  it("lists only what the artist actually has: profile, works, CV and existing texts", () => {
    const f = facts(studio);
    expect(f).toContain("Dante Arola");
    expect(f).toContain("Umbral (2025, Fotogrametría): Un rostro reconstruido a partir de datos.");
    expect(f).toContain("Liminales Expandidas — Acéfala Galería (2026)");
    expect(f).toContain("Bio vieja.");
  });
  it("leaves out sections with nothing confirmed", () => {
    expect(facts({ ...studio, cv: [{ ...cv, confirmed: false }] })).not.toContain("Trayectoria");
  });
});

describe("draftText", () => {
  it("sends the facts and the artist's own notes, and forbids inventing", async () => {
    let prompt = "", system = "";
    const out = await draftText("statement", studio, "trabajo con clones digitales", async (p, o) => { prompt = p; system = o?.system ?? ""; return "```\n\"Mi obra investiga…\"\n```"; });
    expect(prompt).toContain("trabajo con clones digitales");
    expect(prompt).toContain("Umbral");
    expect(system).toMatch(/no inventes/i);
    expect(system).toMatch(/primera persona/i);
    expect(out).toBe("Mi obra investiga…");
  });

  it("asks for third person and ~80 words for the short bio", async () => {
    let system = "";
    await draftText("bio_short", studio, "", async (_p, o) => { system = o?.system ?? ""; return "x"; });
    expect(system).toMatch(/tercera persona/i);
    expect(system).toMatch(/80 palabras/);
  });

  it("keeps quotes that belong to the text and only strips a wrapping pair", async () => {
    expect(await draftText("statement", studio, "", async () => 'Presenté la serie "Umbral"')).toBe('Presenté la serie "Umbral"');
    expect(await draftText("statement", studio, "", async () => '"Todo el texto."')).toBe("Todo el texto.");
  });

  it("returns null when there is no AI, so the UI can say so", async () => {
    expect(await draftText("bio_long", studio, "", async () => null)).toBeNull();
  });
});

describe("translateText", () => {
  it("translates to English keeping names and titles", async () => {
    let prompt = "", system = "";
    const out = await translateText("Mi obra investiga el umbral.", async (p, o) => { prompt = p; system = o?.system ?? ""; return "My work explores the threshold."; });
    expect(prompt).toContain("Mi obra investiga el umbral.");
    expect(system).toMatch(/English/);
    expect(out).toBe("My work explores the threshold.");
  });
  it("does not call the model for empty text", async () => {
    expect(await translateText("  ", async () => { throw new Error("called"); })).toBeNull();
  });
});

describe("tags", () => {
  it("reads the model's JSON even inside a code fence, lowercased, deduped and capped", () => {
    expect(parseTags('```json\n{"mediums":["Instalación","instalación","Video"],"themes":["Identidad","datos","a","b","c","d","e","f"]}\n```'))
      .toEqual({ mediums: ["instalación", "video"], themes: ["identidad", "datos", "a", "b", "c", "d"] });
  });
  it("returns null for anything that is not that JSON", async () => {
    expect(parseTags("no sé")).toBeNull();
    expect(await suggestTags(studio, async () => "no sé")).toBeNull();
  });
});
