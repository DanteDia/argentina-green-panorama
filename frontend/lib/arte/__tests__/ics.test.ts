import { describe, expect, it } from "vitest";
import { toIcs } from "../ics";

const NOW = new Date("2026-11-11T12:00:00Z");

describe("toIcs", () => {
  it("writes an all-day event on the closing date, ending the next day even across a month", () => {
    const ics = toIcs([{ uid: "app1", date: "2026-11-30", title: "Cierra: Bienal Sur" }], NOW);
    expect(ics).toContain("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261130\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20261201\r\n");
    expect(ics).toContain("UID:app1@arte.industriesverified\r\n");
    expect(ics).toContain("DTSTAMP:20261111T120000Z\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("reminds a week and two days before", () => {
    const ics = toIcs([{ uid: "a", date: "2026-12-10", title: "x" }], NOW);
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2);
    expect(ics).toContain("TRIGGER:-P7D");
    expect(ics).toContain("TRIGGER:-P2D");
  });

  it("escapes text so a comma, a semicolon or a line break in a name can't break the file", () => {
    const ics = toIcs([{ uid: "a", date: "2026-12-10", title: "Cierra: Premio A, B; C", description: "línea 1\nlínea 2", url: "https://x.org/a?b=1" }], NOW);
    expect(ics).toContain("SUMMARY:Cierra: Premio A\\, B\\; C\r\n");
    expect(ics).toContain("DESCRIPTION:línea 1\\nlínea 2\r\n");
    expect(ics).toContain("URL:https://x.org/a?b=1\r\n");
  });

  it("folds long lines, as calendar apps require", () => {
    const ics = toIcs([{ uid: "a", date: "2026-12-10", title: "Cierra: ".concat("Residencia internacional ".repeat(8)) }], NOW);
    for (const line of ics.split("\r\n")) expect(line.length).toBeLessThanOrEqual(75);
    expect(ics.replace(/\r\n /g, "")).toContain("Residencia internacional Residencia internacional");
  });

  it("skips events without a real date, and an empty list is still a valid calendar", () => {
    expect(toIcs([{ uid: "a", date: "pronto", title: "x" }], NOW)).not.toContain("BEGIN:VEVENT");
    expect(toIcs([], NOW)).toBe("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//IndustriesVerified//Arte//ES\r\nCALSCALE:GREGORIAN\r\nEND:VCALENDAR\r\n");
  });
});
