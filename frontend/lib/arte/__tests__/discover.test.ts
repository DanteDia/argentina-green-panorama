import { describe, expect, it } from "vitest";
import { affineArtists, affinePeople, affineVenues, yourVenues, type DiscoverCtx } from "../discover";
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

describe("affinePeople", () => {
  const people = (follows: string[]) => ctx({
    follows,
    nodes: [...ctx().nodes,
      { id: "c1", name: "Coleccionista Seguido", kind: "coleccionista", text: "" },
      { id: "p1", name: "Curadora de Acéfala", kind: "persona", text: "" },
      { id: "p2", name: "Famoso Seguido", kind: "persona", text: "" },
      { id: "p3", name: "Cerca De Seguidos", kind: "persona", text: "" }],
    edges: [...ctx().edges, { source: "p1", target: "g1" }, { source: "p3", target: "a1" }],
  });

  it("suggests collectors you follow and people tied to your spaces or to artists you follow", () => {
    const r = affinePeople(people(["c1", "p2", "a1"]));
    expect(r.map((x) => x.nodeId).sort()).toEqual(["c1", "p1", "p3"]);
    expect(r.find((x) => x.nodeId === "p1")!.reasons).toContain("vinculada a galería Acéfala");
    expect(r.find((x) => x.nodeId === "p3")!.reasons).toContain("conectada con 1 artista que seguís");
  });

  it("never suggests a generic person only because you follow them", () => {
    expect(affinePeople(people(["p2"])).map((x) => x.nodeId)).not.toContain("p2");
  });
});

describe("yourVenues", () => {
  it("lists the spaces you already worked with, first in line for an invitation", () => {
    const r = yourVenues(ctx());
    expect(r.map((x) => x.nodeId)).toEqual(["g1"]);
    expect(r[0].reasons).toContain("ya trabajaste con esta galería");
  });
});
