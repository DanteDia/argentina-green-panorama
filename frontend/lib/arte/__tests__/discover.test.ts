import { describe, expect, it } from "vitest";
import { affineArtists, affineVenues, type DiscoverCtx } from "../discover";
import { perfil } from "./fixtures";

const ctx = (o: Partial<DiscoverCtx> = {}): DiscoverCtx => ({
  profile: perfil({ themes: ["identidad", "tecnología"] }),
  myNodeId: "me",
  follows: [],
  nodes: [
    { id: "me", name: "Yo", kind: "artista", text: "" },
    { id: "a1", name: "Artista Seguida", kind: "artista", text: "pintura" },
    { id: "a2", name: "Comparte Galería", kind: "artista", text: "escultura" },
    { id: "a3", name: "Mismos Temas", kind: "artista", text: "Su obra explora la identidad y la tecnología." },
    { id: "a4", name: "Sin Relación", kind: "artista", text: "acuarela" },
    { id: "g1", name: "Acéfala", kind: "galeria", text: "" },
    { id: "g2", name: "Galería Lejana", kind: "galeria", text: "" },
  ],
  edges: [
    { source: "me", target: "g1" },
    { source: "a2", target: "g1" },
    { source: "a1", target: "g2" },
  ],
  ...o,
});

describe("affineArtists", () => {
  it("ranks artists you follow on Instagram first, and says so", () => {
    const r = affineArtists(ctx({ follows: ["a1"] }));
    expect(r[0].nodeId).toBe("a1");
    expect(r[0].reasons).toContain("lo seguís en Instagram");
  });

  it("explains a shared gallery by name", () => {
    const r = affineArtists(ctx());
    expect(r.find((x) => x.nodeId === "a2")!.reasons).toContain("comparten galería Acéfala");
  });

  it("finds theme overlap, never returns yourself or unrelated artists", () => {
    const ids = affineArtists(ctx()).map((x) => x.nodeId);
    expect(ids).toContain("a3");
    expect(ids).not.toContain("me");
    expect(ids).not.toContain("a4");
  });
});

describe("affineVenues", () => {
  it("suggests venues where artists you follow show, excluding ones you already showed at", () => {
    const r = affineVenues(ctx({ follows: ["a1"] }));
    expect(r.map((x) => x.nodeId)).toEqual(["g2"]);
    expect(r[0].reasons[0]).toMatch(/1 artista que seguís/);
  });
});
