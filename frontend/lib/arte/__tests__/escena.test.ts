import { describe, expect, it } from "vitest";
import { decodeEntities, publicLink, redactContacts, relationSections, SHOWN_TYPES } from "../escena";

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

describe("decodeEntities", () => {
  it("turns the HTML entities scraped descriptions carry back into letters", () => {
    expect(decodeEntities("contempor&#225;neo, librer&#237;a &amp; caf&eacute; &#x27;sur&#x27;")).toBe("contemporáneo, librería & café 'sur'");
    expect(decodeEntities("sin entidades")).toBe("sin entidades");
  });
});

describe("what a public page never shows", () => {
  it("removes emails, phones, WhatsApp links and handles from a bio", () => {
    expect(redactContacts("Artista visual. Contacto: ana.perez@gmail.com · WhatsApp +54 9 11 5555-1234 · wa.me/5491155551234 · @ana.arte. Buenos Aires"))
      .toBe("Artista visual. Contacto: · WhatsApp · · Buenos Aires");
    expect(redactContacts("Pintura y grabado desde 2010")).toBe("Pintura y grabado desde 2010");
    expect(redactContacts("Residencias 2010 - 2020, taller 2019-2023")).toBe("Residencias 2010 - 2020, taller 2019-2023");
    expect(redactContacts("Abierto 1998-2024 - 2025")).toBe("Abierto 1998-2024 - 2025");
    for (const bio of ["Escribinos 4555-1234", "Tel:4555-1234", "tel 4555 1234 int 12", "(011) 4555-1234", "11 5555 1234 / 4555 1234",
                       "info [at] galeria.com", "info(at)galeria.com", "IG:@galeria", "Seguinos (@galeria)"]) {
      expect(redactContacts(bio)).not.toMatch(/\d{4}|galeria/);
    }
  });

  it("shows a link only when it is a web address", () => {
    expect(publicLink("https://proa.org")).toBe("https://proa.org");
    expect(publicLink("https://wa.me/5491155551234")).toBeNull();
    expect(publicLink("mailto:a@b.com")).toBeNull();
    expect(publicLink(null)).toBeNull();
  });

  it("leaves out who buys, owns or donates whose work", () => {
    for (const t of ["en_coleccion_de", "adquirio_obra_de", "vendio_obra_de", "dono_a", "miembro_comite_adquisiciones", "es_titular_de"]) {
      expect(SHOWN_TYPES).not.toContain(t);
    }
  });
});
