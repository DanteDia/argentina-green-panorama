import { describe, expect, it } from "vitest";
import { relationSections } from "../escena";

const e = (source_id: string, target_id: string, relationship_type: string) => ({ source_id, target_id, relationship_type });
const names = new Map([["gal", "Galería Sur"], ["a1", "Ana"], ["a2", "Beto"], ["mus", "Museo Norte"], ["ig", "Cuenta"]]);

describe("relationSections", () => {
  it("names each relationship from the side of the page's node, in both directions", () => {
    const s = relationSections("gal", [e("a1", "gal", "representado_por"), e("a2", "gal", "representado_por"), e("gal", "mus", "participo_en")], names);
    expect(s).toEqual([
      { title: "Representa a", items: [{ id: "a1", name: "Ana" }, { id: "a2", name: "Beto" }] },
      { title: "Participó en", items: [{ id: "mus", name: "Museo Norte" }] },
    ]);
    expect(relationSections("a1", [e("a1", "gal", "representado_por")], names)).toEqual([
      { title: "Representado por", items: [{ id: "gal", name: "Galería Sur" }] },
    ]);
  });

  it("leaves out Instagram tags and press mentions, nodes it cannot name, and repeats", () => {
    const s = relationSections("gal", [
      e("ig", "gal", "etiquetado_en"), e("ig", "gal", "mencionado_con"),
      e("zz", "gal", "expuso_en"), e("a1", "gal", "expuso_en"), e("a1", "gal", "expuso_en"),
    ], names);
    expect(s).toEqual([{ title: "Expusieron acá", items: [{ id: "a1", name: "Ana" }] }]);
  });

  it("orders sections by how much they say about a space: who it represents and shows first", () => {
    const s = relationSections("gal", [e("gal", "mus", "participo_en"), e("a1", "gal", "expuso_en"), e("a2", "gal", "representado_por")], names);
    expect(s.map((x) => x.title)).toEqual(["Representa a", "Expusieron acá", "Participó en"]);
  });
});
