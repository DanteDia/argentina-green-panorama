import { describe, expect, it } from "vitest";
import { toIcs } from "../ics";

const NOW = new Date("2026-11-11T12:00:00Z");

describe("toIcs", () => {
  it("writes an all-day event on the closing date, ending the next day even across a month", () => {
    const ics = toIcs([{ uid: "app1", date: "2026-11-30", title: "Cierra: Bienal Sur" }], NOW)!;
    expect(ics).toContain("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261130\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20261201\r\n");
    expect(ics).toContain("UID:app1@arte.industriesverified\r\n");
    expect(ics).toContain("DTSTAMP:20261111T120000Z\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("reminds a week and two days before", () => {
    const ics = toIcs([{ uid: "a", date: "2026-12-10", title: "x" }], NOW)!;
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2);
    // an all-day event starts at 00:00: these land at 9 in the morning, 7 and 2 days before. The week-before one goes first (some apps keep only the first)
    expect(ics.indexOf("TRIGGER:-P6DT15H")).toBeGreaterThan(0);
    expect(ics.indexOf("TRIGGER:-P1DT15H")).toBeGreaterThan(ics.indexOf("TRIGGER:-P6DT15H"));
    expect(ics).toContain("TRANSP:TRANSPARENT");
  });

  it("escapes text so a comma, a semicolon or a line break in a name can't break the file", () => {
    const ics = toIcs([{ uid: "a", date: "2026-12-10", title: "Cierra: Premio A, B; C", description: "línea 1\nlínea 2", url: "https://x.org/a?b=1" }], NOW)!;
    expect(ics).toContain("SUMMARY:Cierra: Premio A\\, B\\; C\r\n");
    expect(ics).toContain("DESCRIPTION:línea 1\\nlínea 2\r\n");
    expect(ics).toContain("URL:https://x.org/a?b=1\r\n");
  });

  it("a name with stray line breaks or control characters can't add lines to the file", () => {
    const ics = toIcs([{ uid: "a", date: "2026-12-10", title: "X\rEND:VEVENT\rBEGIN:VEVENT\u0000\u0007" }], NOW)!;
    const lines = ics.split(/\r\n|\r|\n/);   // however a parser splits lines, there is still exactly one event
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
    expect(lines.filter((l) => l === "END:VEVENT")).toHaveLength(1);
    expect(ics).toContain("SUMMARY:X\\nEND:VEVENT\\nBEGIN:VEVENT\r\n");
  });

  it("folds long lines at 75 bytes, counting accents and emoji as what they weigh", () => {
    const ics = toIcs([{ uid: "a", date: "2026-12-10", title: "Cierra: ".concat("Residéncia internaciónal 🎨 ".repeat(8)) }], NOW)!;
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(ics.replace(/\r\n /g, "")).toContain("Residéncia internaciónal 🎨 Residéncia internaciónal 🎨");
  });

  it("returns nothing when there is no dated event: an empty calendar is not a valid file", () => {
    expect(toIcs([{ uid: "a", date: "pronto", title: "x" }], NOW)).toBeNull();
    expect(toIcs([], NOW)).toBeNull();
  });
});
