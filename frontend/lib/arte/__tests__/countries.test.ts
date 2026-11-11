import { describe, expect, it } from "vitest";
import { COUNTRIES, countryCode, countryOptions } from "../countries";
import { LATAM } from "../eligibility";

describe("countries", () => {
  const codes = COUNTRIES.map(([c]) => c);

  it("lists every country once, by the ISO code eligibility rules use, named in Spanish, Argentina first", () => {
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.length).toBeGreaterThan(240);
    for (const c of codes) expect(c).toMatch(/^[A-Z]{2}$/);
    expect(COUNTRIES[0]).toEqual(["AR", "Argentina"]);
    expect(Object.fromEntries(COUNTRIES)).toMatchObject({ IE: "Irlanda", DK: "Dinamarca", BR: "Brasil", US: "Estados Unidos", DE: "Alemania" });
  });

  it("every country a call can mean by LATAM can be chosen", () => {
    for (const c of LATAM) expect(codes, c).toContain(c);
  });

  it("reads a stored value the same way everywhere, and keeps one it does not know", () => {
    expect(countryCode(" mx ")).toBe("MX");
    expect(countryCode(null)).toBe("");
    expect(countryOptions(" mx ")).toBe(COUNTRIES);
    expect(countryOptions("Argentina").at(-1)).toEqual(["ARGENTINA", "ARGENTINA"]);
    expect(countryOptions(null)).toBe(COUNTRIES);
  });
});
