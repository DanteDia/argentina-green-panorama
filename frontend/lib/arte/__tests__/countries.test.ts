import { describe, expect, it } from "vitest";
import { COUNTRIES, countryOptions } from "../countries";
import { checkEligibility } from "../eligibility";
import { perfil, programa } from "./fixtures";

describe("countries", () => {
  it("lists each country once, by the ISO code eligibility rules use", () => {
    const codes = COUNTRIES.map(([c]) => c);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(c).toMatch(/^[A-Z]{2}$/);
    expect(COUNTRIES[0]).toEqual(["AR", "Argentina"]);
  });

  it("every Latin American country a call can mean by LATAM can be chosen", () => {
    const now = new Date("2026-11-11T12:00:00Z");
    const latam = COUNTRIES.filter(([c]) => checkEligibility(perfil({ nationality: c, residence: c }), programa({ eligibility: { nationality: ["LATAM"] } }), now).ok);
    expect(latam.length).toBe(23);
  });

  it("keeps a code already in the profile even when it is not in the list", () => {
    expect(countryOptions("ZA").at(-1)).toEqual(["ZA", "ZA"]);
    expect(countryOptions("ar")).toBe(COUNTRIES);
    expect(countryOptions(null)).toBe(COUNTRIES);
  });
});
