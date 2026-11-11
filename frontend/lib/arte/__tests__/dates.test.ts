import { describe, expect, it } from "vitest";
import { nextWindow, programState, todayAR } from "../dates";
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

  it("no closing date + a window that is still far away is 'recurrente' and never guessed open or closed", () => {
    const s = programState(programa({ closes_at: null, window_text: "anual; convocatoria ~abr–jun" }), NOW);
    expect(s.label).toBe("recurrente");
    expect(s.text).toContain("abr–jun");
  });

  it("no closing date and no window says 'fecha a confirmar'", () => {
    const s = programState(programa({ closes_at: null, window_text: null }), NOW);
    expect(s.label).toBe("recurrente");
    expect(s.text).toContain("fecha a confirmar");
  });

  it("a past date with a window that is far away is recurring; without a window it is closed", () => {
    expect(programState(programa({ closes_at: "2026-06-09", window_text: "anual; ~abr–jun" }), NOW).label).toBe("recurrente");
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

// A yearly call whose usual window is near must not sit in the "someday" pile: that is how Prix Ars Electronica
// (closed 9 Mar, opens again in January) never reached the artist's first screen.
describe("recurring calls whose usual window is near", () => {
  it("a window starting within 90 days reads 'próxima', says when it usually opens and that the date is an estimate", () => {
    const s = programState(programa({ closes_at: "2026-03-09", window_text: "anual; convocatoria ~ene–mar" }), NOW);
    expect(s.label).toBe("próxima");
    expect(s.projected).toBe(true);
    expect(s.text).toContain("Suele abrir en enero");
    expect(s.text).toContain("9 mar");
    expect(s.text).toMatch(/a confirmar/);
  });

  it("works without any known date, and across the year end", () => {
    expect(programState(programa({ closes_at: null, window_text: "anual; ~dic–feb" }), NOW).text).toContain("Suele abrir en diciembre");
  });

  it("inside the usual window with no announced date it says so instead of claiming it is open", () => {
    const s = programState(programa({ closes_at: null, window_text: "convocatoria oct–dic; inicio marzo" }), NOW);
    expect(s.label).toBe("próxima");
    expect(s.projected).toBe(true);
    expect(s.text).toMatch(/Suele estar abierta en esta época.*confirmá/);
  });

  it("an edition that already closed inside this window is not announced again", () => {
    expect(programState(programa({ closes_at: "2026-11-04", window_text: "anual; oct–dic" }), NOW).label).toBe("recurrente");
  });

  it("an announced date always wins over the usual window", () => {
    const s = programState(programa({ closes_at: "2026-12-20", window_text: "anual; ~ene–mar" }), NOW);
    expect(s.label).toBe("abierta");
    expect(s.projected).toBeUndefined();
  });

  it("reads months only: 'abre' is not April and a window without months stays recurring", () => {
    expect(programState(programa({ closes_at: null, window_text: "abre por invitación" }), NOW).label).toBe("recurrente");
    expect(programState(programa({ closes_at: null, window_text: "anual, durante la feria" }), NOW).label).toBe("recurrente");
  });
});

describe("nextWindow", () => {
  it("takes the first range of months named, not a later month about something else", () => {
    expect(nextWindow("convocatoria oct–dic; inicio marzo", "2026-11-15")).toEqual({ opens: "2026-10-01", closes: "2026-12-28" });
  });
  it("a single month is a one-month window; a passed one moves to next year", () => {
    expect(nextWindow("anual; cierre en septiembre", "2026-11-15")).toEqual({ opens: "2027-09-01", closes: "2027-09-28" });
  });
  it("skips the window an already-held edition closed in", () => {
    expect(nextWindow("anual; ~ene–mar", "2027-02-10", "2027-02-01")).toEqual({ opens: "2028-01-01", closes: "2028-03-28" });
  });
});
