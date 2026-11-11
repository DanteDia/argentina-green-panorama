import { describe, expect, it } from "vitest";
import { contactOf, gmailComposeUrl, inviteCandidates, inviteKey, inviteText, instagramDmUrl, type Show } from "../invite";
import type { Affine } from "../discover";

const show: Show = {
  id: "s1", title: "Frecuencias Híbridas", venue: "Acéfala Galería", address: "Niceto Vega 4754",
  when_text: "jueves 12/11, 18 a 21 h", link: "https://acefala.example/muestra", note: "Es mi primera individual.",
};

describe("contactOf", () => {
  it("prefers email, then Instagram, and cleans the handle", () => {
    expect(contactOf({ email: " A@B.com ", instagram: "@x" })).toEqual({ channel: "email", email: "a@b.com", instagram: "x" });
    expect(contactOf({ instagram: "@Galeria.Uno" })).toEqual({ channel: "instagram", email: null, instagram: "galeria.uno" });
    expect(contactOf({ email: "not-an-email" })).toEqual({ channel: null, email: null, instagram: null });
    expect(contactOf(null)).toEqual({ channel: null, email: null, instagram: null });
  });

  it("rejects addresses Gmail would split into two recipients, and junk handles", () => {
    expect(contactOf({ email: "a,b@x.com" }).email).toBeNull();
    expect(contactOf({ instagram: "https://www.instagram.com/Galeria.Uno/" }).instagram).toBe("galeria.uno");
    expect(contactOf({ instagram: "no es un handle" })).toEqual({ channel: null, email: null, instagram: null });
    expect(contactOf({ instagram: "https://m.instagram.com/galeria.uno" }).instagram).toBe("galeria.uno");
    expect(contactOf({ instagram: "instagram.com/p/XYZ" }).instagram).toBeNull();
    expect(contactOf({ email: ["a@b.com"] as unknown as string, instagram: 3 as unknown as string })).toEqual({ channel: null, email: null, instagram: null });
  });
});

describe("inviteText", () => {
  it("builds a short personal invitation with every show detail that exists", () => {
    const { subject, body } = inviteText(show, "Lucía Pérez", "Dante Arola", "https://dantearola.com");
    expect(subject).toBe("Te invito a Frecuencias Híbridas, jueves 12/11, 18 a 21 h");
    expect(body).toContain("Hola Lucía,");
    expect(body).toContain("Frecuencias Híbridas, en Acéfala Galería");
    expect(body).toContain("jueves 12/11, 18 a 21 h · Niceto Vega 4754");
    expect(body).toContain("Es mi primera individual.");
    expect(body).toContain("https://acefala.example/muestra");
    expect(body.trim().endsWith("Dante Arola\nhttps://dantearola.com")).toBe(true);
  });

  it("greets an institution by its full name, a person by first name", () => {
    expect(inviteText(show, "Acéfala Galería", "Ana", null, false).body.startsWith("Hola, equipo de Acéfala Galería:")).toBe(true);
    expect(inviteText(show, "Lucía Pérez", "Ana", null, true).body.startsWith("Hola Lucía,")).toBe(true);
    const team = inviteText(show, "Acéfala Galería", "Ana", null, false);
    expect(team.body).toContain("Me encantaría que vengan.");
    expect(team.body).toContain("Quiero invitarlos a Frecuencias Híbridas");
    expect(team.subject).toBe("Invitación a Frecuencias Híbridas, jueves 12/11, 18 a 21 h");
    expect(inviteText(show, "Lucía Pérez", "Ana", null, true).body).toContain("Me encantaría que vengas.");
  });

  it("skips missing fields without leaving empty lines or separators", () => {
    const { subject, body } = inviteText({ id: "s", title: "Muestra", venue: null, address: null, when_text: null, link: null, note: null }, "", "Ana", null);
    expect(subject).toBe("Te invito a Muestra");
    expect(body).toContain("Hola,");
    expect(body).not.toMatch(/\n{3,}|·|, en/);
  });
});

describe("links", () => {
  it("opens a filled Gmail compose window", () => {
    const u = new URL(gmailComposeUrl({ to: "a@b.com", subject: "Hola & chau", body: "línea 1\nlínea 2" }));
    expect(u.origin + u.pathname).toBe("https://mail.google.com/mail/");
    expect(u.searchParams.get("view")).toBe("cm");
    expect(u.searchParams.get("to")).toBe("a@b.com");
    expect(u.searchParams.get("su")).toBe("Hola & chau");
    expect(u.searchParams.get("body")).toBe("línea 1\nlínea 2");
  });

  it("opens an Instagram DM thread", () => {
    expect(instagramDmUrl("galeria.uno")).toBe("https://ig.me/m/galeria.uno");
  });
});

describe("inviteCandidates", () => {
  const a = (nodeId: string, kind: string, score: number): Affine => ({ nodeId, name: nodeId.toUpperCase(), kind, reasons: ["r"], score });
  const rows = new Map([
    ["g1", { contact_info: { email: "g1@x.com" } }],
    ["a1", { contact_info: { instagram: "a1" } }],
    ["a2", { contact_info: {} }],
  ]);

  it("merges venues and artists by score, attaches contact, drops the unreachable and already invited", () => {
    const out = inviteCandidates([[a("a1", "artista", 20), a("a2", "artista", 90)], [a("g1", "galeria", 30)]], rows, new Set([inviteKey({ nodeId: "zz" })]));
    expect(out.map((c) => c.nodeId)).toEqual(["g1", "a1"]);
    expect(out[0].contact.channel).toBe("email");
    const sent = inviteCandidates([[a("a1", "artista", 20)], [a("g1", "galeria", 30)]], rows, new Set([inviteKey({ nodeId: "g1" })]));
    expect(sent.map((c) => c.nodeId)).toEqual(["a1"]);
  });

  it("hides a graph guest already invited by hand under their email or handle", () => {
    const out = inviteCandidates([[a("g1", "galeria", 30), a("a1", "artista", 20)]], rows, new Set([inviteKey({ email: "G1@x.com" }), inviteKey({ instagram: "@a1" })]));
    expect(out).toEqual([]);
  });

  it("refuses to key a guest with no contact at all", () => {
    expect(() => inviteKey({})).toThrow();
  });

  it("keys manual guests by email so the same person isn't invited twice", () => {
    expect(inviteKey({ email: "A@B.com" })).toBe(inviteKey({ email: "a@b.com" }));
  });
});
