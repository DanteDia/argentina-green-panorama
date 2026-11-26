import { describe, expect, it } from "vitest";
import { buildDigest, renderDigestEmail, unsubscribeToken, validUnsubscribe } from "../digest";
import type { Ranked } from "../match";
import { programa } from "./fixtures";

const r = (id: string, o: Parameters<typeof programa>[0] = {}, score = 50, label = "abierta"): Ranked => ({
  program: programa({ id, name: id, ...o }),
  score,
  reasons: [],
  effortDays: 3,
  state: { label: label as Ranked["state"]["label"], text: "" },
  eligibilityNotes: [],
});

const SINCE = "2026-11-23T00:00:00Z";
const TODAY = "2026-11-30";

describe("buildDigest", () => {
  it("lists what appeared since the last mail that the artist can still send, best fit first", () => {
    const d = buildDigest([
      r("nueva-buena", { first_seen_at: "2026-11-24T10:00:00Z", closes_at: "2027-02-01" }, 90),
      r("nueva-proxima", { first_seen_at: "2026-11-25T10:00:00Z", closes_at: "2027-03-01" }, 70, "próxima"),
      r("vieja", { first_seen_at: "2026-11-01T00:00:00Z", closes_at: "2027-02-01" }, 99),
      r("nueva-recurrente", { first_seen_at: "2026-11-24T10:00:00Z", closes_at: null }, 95, "recurrente"),
    ], SINCE, TODAY)!;
    expect(d.nuevas.map((x) => x.program.id)).toEqual(["nueva-buena", "nueva-proxima"]);
  });

  it("adds the calls closing in the next three weeks that are already open, soonest first, without repeating the new ones", () => {
    const d = buildDigest([
      r("nueva", { first_seen_at: "2026-11-24T10:00:00Z", closes_at: "2026-12-05" }, 90),
      r("cierra-pronto", { first_seen_at: "2026-10-01T00:00:00Z", closes_at: "2026-12-10" }, 40),
      r("cierra-ya", { first_seen_at: "2026-10-01T00:00:00Z", closes_at: "2026-12-02" }, 30),
      r("cierra-lejos", { first_seen_at: "2026-10-01T00:00:00Z", closes_at: "2027-01-30" }, 80),
      r("abre-despues", { first_seen_at: "2026-10-01T00:00:00Z", opens_at: "2026-12-15", closes_at: "2026-12-20" }, 80, "próxima"),
    ], SINCE, TODAY)!;
    expect(d.cierran.map((x) => x.program.id)).toEqual(["cierra-ya", "cierra-pronto"]);
  });

  it("sends nothing when there is nothing new and nothing closing", () => {
    expect(buildDigest([r("vieja", { first_seen_at: "2026-11-01T00:00:00Z", closes_at: "2027-05-01" })], SINCE, TODAY)).toBeNull();
  });

  it("keeps each list short", () => {
    const many = Array.from({ length: 12 }, (_, i) => r(`n${i}`, { first_seen_at: "2026-11-24T10:00:00Z", closes_at: "2027-02-01" }, 100 - i));
    expect(buildDigest(many, SINCE, TODAY)!.nuevas).toHaveLength(5);
  });
});

describe("renderDigestEmail", () => {
  const d = buildDigest([
    r("<b>Beca</b>", { first_seen_at: "2026-11-24T10:00:00Z", closes_at: "2026-12-10", organizer: "Fundación & Co" }, 90),
  ], SINCE, TODAY)!;
  const m = renderDigestEmail(d, { name: "Dante Arola", baseUrl: "https://iv.test", unsubscribeUrl: "https://iv.test/arte/baja?u=1&t=x" });

  it("says how many there are in the subject and greets by first name", () => {
    expect(m.subject).toBe("1 convocatoria nueva para vos");
    expect(m.text).toContain("Hola, Dante");
  });

  it("escapes names taken from listings and links each call to its page in the tool", () => {
    expect(m.html).not.toContain("<b>Beca</b>");
    expect(m.html).toContain("&lt;b&gt;Beca&lt;/b&gt;");
    expect(m.html).toContain("Fundación &amp; Co");
    expect(m.html).toContain('href="https://iv.test/arte/oportunidades/%3Cb%3EBeca%3C%2Fb%3E"');
  });

  it("always carries the unsubscribe link", () => {
    expect(m.html).toContain('href="https://iv.test/arte/baja?u=1&amp;t=x"');
    expect(m.text).toContain("https://iv.test/arte/baja?u=1&t=x");
  });
});

describe("unsubscribe token", () => {
  it("is valid only for the user it was made for", () => {
    const t = unsubscribeToken("user-1", "secret");
    expect(validUnsubscribe("user-1", t, "secret")).toBe(true);
    expect(validUnsubscribe("user-2", t, "secret")).toBe(false);
    expect(validUnsubscribe("user-1", t, "other")).toBe(false);
    expect(validUnsubscribe("user-1", "", "secret")).toBe(false);
  });
});
