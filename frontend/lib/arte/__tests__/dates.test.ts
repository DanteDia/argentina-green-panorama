import { describe, expect, it } from "vitest";
import { programState, todayAR } from "../dates";
import { programa } from "./fixtures";

// 2026-11-15 10:00 in Buenos Aires (UTC-3) = 13:00 UTC
const NOW = new Date("2026-11-15T13:00:00Z");

describe("programState", () => {
  it("uses the Buenos Aires calendar day", () => {
    expect(todayAR(new Date("2026-11-16T02:30:00Z"))).toBe("2026-11-15"); // still the 15th in BA
  });

  it("closing today reads 'cierra hoy', not 'cerrada'", () => {
    expect(programState(programa({ closes_at: "2026-11-15" }), NOW).label).toBe("cierra hoy");
  });

  it("an open call counts the days left", () => {
    const s = programState(programa({ closes_at: "2026-11-25" }), NOW);
    expect(s.label).toBe("abierta");
    expect(s.daysLeft).toBe(10);
  });

  it("a call that opens later is 'próxima'", () => {
    expect(programState(programa({ opens_at: "2026-12-01", closes_at: "2026-12-30" }), NOW).label).toBe("próxima");
  });

  it("no closing date + known window is 'recurrente' and never guessed open or closed", () => {
    const s = programState(programa({ closes_at: null, window_text: "anual; convocatoria ~ene–mar" }), NOW);
    expect(s.label).toBe("recurrente");
    expect(s.text).toContain("ene–mar");
  });

  it("no closing date and no window says 'fecha a confirmar'", () => {
    const s = programState(programa({ closes_at: null, window_text: null }), NOW);
    expect(s.label).toBe("recurrente");
    expect(s.text).toContain("fecha a confirmar");
  });

  it("a past date with a known window is recurring; without a window it is closed", () => {
    expect(programState(programa({ closes_at: "2026-03-09", window_text: "anual; ~ene–mar" }), NOW).label).toBe("recurrente");
    expect(programState(programa({ closes_at: "2026-03-09", window_text: null }), NOW).label).toBe("cerrada");
  });
});

describe("implausible far deadlines", () => {
  it("a closing date more than 9 months away is shown as 'a confirmar', not as a long open window", () => {
    const s = programState(programa({ closes_at: "2027-12-15" }), NOW);
    expect(s.label).toBe("recurrente");
    expect(s.text).toMatch(/a confirmar/);
  });
});
