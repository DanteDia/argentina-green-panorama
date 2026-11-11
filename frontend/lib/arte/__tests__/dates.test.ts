import { describe, expect, it } from "vitest";
import { dueDate, nextWindow, programState, todayAR } from "../dates";
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

  it("the horizon is 90 days before the window opens", () => {
    const p = programa({ closes_at: null, window_text: "anual; convocatoria ~ene–mar" });
    expect(programState(p, new Date("2026-10-03T13:00:00Z")).label).toBe("próxima");   // 90 days to 1 Jan
    expect(programState(p, new Date("2026-10-02T13:00:00Z")).label).toBe("recurrente"); // 91
  });

  it("a single month is not worded as an opening: 'cierre ~sep' may mean it closes then", () => {
    const s = programState(programa({ closes_at: null, window_text: "anual; cierre ~sep" }), new Date("2026-07-01T13:00:00Z"));
    expect(s.label).toBe("próxima");
    expect(s.text).toContain("Su convocatoria suele ser en septiembre (anual; cierre ~sep)");
    expect(s.text).not.toMatch(/abrir/);
  });

  it("an edition that closed shortly before the usual window is that edition: it is not announced again", () => {
    const now = new Date("2026-03-05T13:00:00Z");
    expect(programState(programa({ closes_at: "2026-02-27", window_text: "anual; ~mar–abr" }), now).label).toBe("recurrente");
  });

  it("says the year of a last closing that is not from this year", () => {
    const s = programState(programa({ closes_at: "2025-03-09", window_text: "anual; convocatoria ~ene–mar" }), NOW);
    expect(s.text).toContain("9 mar de 2025");
  });

  it("an announced opening with no closing date wins over the usual window", () => {
    const s = programState(programa({ opens_at: "2026-12-10", closes_at: null, window_text: "anual; ~nov–dic" }), NOW);
    expect(s.label).toBe("próxima");
    expect(s.projected).toBeUndefined();
    expect(s.text).toContain("Abre el 10 dic");
  });
});

describe("nextWindow", () => {
  const T = "2026-11-15";
  it("takes the months of the part about applying, not a later month about something else", () => {
    expect(nextWindow("convocatoria oct–dic; inicio marzo", T)).toEqual({ opens: "2026-10-01", closes: "2026-12-28", single: false });
    expect(nextWindow("residencia ene–mar; convocatoria ago–sep", T)).toMatchObject({ opens: "2027-08-01" });
  });
  it("a single month is a one-month window, flagged; a passed one moves to next year", () => {
    expect(nextWindow("anual; cierre en septiembre", T)).toEqual({ opens: "2027-09-01", closes: "2027-09-28", single: true });
  });
  it("months that are not about applying give no window", () => {
    for (const t of ["anual; finalistas anunciados en mayo", "anual; inicio marzo", "anual; selección feb–mar"]) expect(nextWindow(t, T)).toBeNull();
  });
  it("only whole month words count", () => {
    for (const t of ["abre por invitación", "anual; residencia en Mar del Plata", "abrí tu taller", "convocatoria de arte marítimo", "anual, durante la feria"]) expect(nextWindow(t, T)).toBeNull();
  });
  it("a call that is not yearly is never projected", () => {
    expect(nextWindow("bienal; convocatoria ~ene–mar", T)).toBeNull();
  });
  it("reads ranges however they are written", () => {
    for (const t of ["enero a marzo", "ene—mar", "ene. – mar.", "ene/mar", "entre ene y mar", "de enero hasta marzo"]) expect(nextWindow(t, T)).toMatchObject({ opens: "2027-01-01", closes: "2027-03-28" });
    expect(nextWindow("sept–nov", T)).toMatchObject({ opens: "2026-09-01", closes: "2026-11-28" });
    expect(nextWindow("setiembre", T)).toMatchObject({ opens: "2027-09-01" });
  });
  it("in January, a window that started in December is the current one", () => {
    expect(nextWindow("anual; ~dic–feb", "2027-01-10")).toMatchObject({ opens: "2026-12-01", closes: "2027-02-28" });
  });
  it("skips the window an already-held edition closed in", () => {
    expect(nextWindow("anual; ~ene–mar", "2027-02-10", "2027-02-01")).toMatchObject({ opens: "2028-01-01", closes: "2028-03-28" });
    // also when the window is long enough to end more than 180 days after that closing
    expect(nextWindow("anual; ~mar–nov", "2026-06-01", "2026-03-15")).toMatchObject({ opens: "2027-03-01" });
  });
});

describe("dueDate", () => {
  it("is the announced closing date while it is ahead; a past edition's date is not a due date", () => {
    expect(dueDate({ closes_at: "2026-12-06" }, "2026-11-15")).toBe("2026-12-06");
    expect(dueDate({ closes_at: "2026-03-09" }, "2026-11-15")).toBeNull();
    expect(dueDate({ closes_at: null }, "2026-11-15")).toBeNull();
  });
});
