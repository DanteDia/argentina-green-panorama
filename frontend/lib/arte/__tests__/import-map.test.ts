import { describe, expect, it } from "vitest";
import { mapImport, type GraphNodeImport } from "../import-map";

const nodo: GraphNodeImport = {
  id: "n1", nombre: "Dante Arola", descripcion: "Dante Arola (Buenos Aires, 1993) vive y trabaja en Buenos Aires. Investiga el umbral entre materia y dato.",
  link: "https://dantearola.com", extra: { nacimiento: "1993", lugar_nacimiento: "Buenos Aires", vive_en: "Buenos Aires" },
  contact_info: { instagram: "dantearola" },
  edges: [
    { relationship_type: "expuso_en", target_nombre: "Acéfala Galería", target_tipo: "galeria", fecha: "2026-11" },
    { relationship_type: "premiado_en", target_nombre: "Premio Federico Jorge Klemm", target_tipo: "premio", fecha: "2024" },
    { relationship_type: "participo_en", target_nombre: "Rijksakademie", target_tipo: "institucion", fecha: "2025" },
    { relationship_type: "en_coleccion_de", target_nombre: "MALBA Museo de Arte Latinoamericano de Buenos Aires", target_tipo: "museo", fecha: null },
    { relationship_type: "formado_en", target_nombre: "Universidad Nacional de las Artes", target_tipo: "escuela", fecha: "2015" },
  ],
};

describe("mapImport", () => {
  it("turns graph trajectory edges into CV items with kind and year", () => {
    const d = mapImport({ graphNode: nodo });
    const kinds = Object.fromEntries(d.cv.map((c) => [c.org, [c.kind, c.year]]));
    expect(kinds["Acéfala Galería"]).toEqual(["group", "2026"]);
    expect(kinds["Premio Federico Jorge Klemm"]).toEqual(["prize", "2024"]);
    expect(kinds["Rijksakademie"]).toEqual(["residency", "2025"]);
    expect(kinds["MALBA Museo de Arte Latinoamericano de Buenos Aires"][0]).toBe("collection");
    expect(kinds["Universidad Nacional de las Artes"]).toEqual(["education", "2015"]);
    expect(d.cv.every((c) => c.source === "graph")).toBe(true);
  });

  it("fills profile basics from the graph and keeps the bio as a draft", () => {
    const d = mapImport({ graphNode: nodo });
    expect(d.profile.birth_year).toBe(1993);
    expect(d.profile.base_city).toBe("Buenos Aires");
    expect(d.texts.bio_long).toContain("materia y dato");
  });

  it("takes the public email from the Instagram bio as contact", () => {
    const d = mapImport({ ig: { username: "dantearola", full_name: "Dante Arola", biography: "artista · contacto: hola@dantearola.com", external_url: "https://dantearola.com", public_email: "", follower_count: 900 } });
    expect(d.profile.email_public).toBe("hola@dantearola.com");
    expect(d.profile.instagram).toBe("dantearola");
    expect(d.profile.website).toBe("https://dantearola.com");
  });

  it("builds a draft from the site when Instagram fails, and says so", () => {
    const d = mapImport({ ig: { error: "not found" }, site: { url: "https://x.art", text: "Ana Pérez es artista visual. Su obra explora el paisaje y la memoria a través de la fotografía y la instalación, en diálogo con la ciencia.", images: ["https://x.art/a.jpg", "https://x.art/b.jpg"], pages: [] } });
    expect(d.warnings.join(" ")).toMatch(/No pude leer tu Instagram/);
    expect(d.texts.bio_long).toMatch(/paisaje y la memoria/);
    expect(d.works.length).toBe(2);
    expect(d.works[0].image_url).toBe("https://x.art/a.jpg");
  });
});
