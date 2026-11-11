import { describe, expect, it } from "vitest";
import { followRows, igPosts, mapImport, newDraftWorks, workOrigin, type GraphNodeImport } from "../import-map";

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

  it("offers the artist's Instagram posts as works, with the caption as title and text", () => {
    const d = mapImport({ ig: { username: "x", pk: 1 }, posts: [{ code: "abc", caption: "🔥 Umbral, 2025.\nInstalación con tickets #arte", image: "https://cdn/1.jpg", year: "2025" }, { code: "d", caption: "", image: "https://cdn/2.jpg", year: null }] });
    expect(d.works[0]).toEqual({ title: "Umbral, 2025.", description: "🔥 Umbral, 2025.\nInstalación con tickets #arte", year: "2025", image_url: "https://cdn/1.jpg", source: "instagram.com/p/abc" });
    expect(d.works[1].title).toBe("Obra sin título");
    expect(d.igPk).toBe("1");
  });

  it("titles a post by its first line with words, and never cuts an emoji in half", () => {
    const long = "Serie de retratos ".repeat(5) + "🎨🎨🎨🎨🎨🎨";
    const d = mapImport({ posts: [{ code: "a", caption: "#arte #ba\nUmbral", image: "i", year: null }, { code: "b", caption: long, image: "i", year: null }, { code: "c", caption: "x".repeat(1499) + "🎨", image: "i", year: null }] });
    expect(d.works[0].title).toBe("Umbral");
    for (const w of d.works) for (const t of [w.title, w.description ?? ""]) expect(() => encodeURIComponent(t)).not.toThrow();   // a lone surrogate throws
    expect([...d.works[1].title].length).toBeLessThanOrEqual(80);
  });
});

describe("igPosts", () => {
  it("reads image, caption and year from the API's media items, first slide of a carousel", () => {
    const img = (u: string, w: number) => ({ url: u, width: w });
    const posts = igPosts([
      { media: { code: "a", taken_at: 1767312000, caption: { text: "Hola" }, image_versions2: { candidates: [img("big", 1440), img("mid", 1080), img("small", 320)] } } },
      { code: "b", caption: null, carousel_media: [{ image_versions2: { candidates: [img("c1", 640)] } }, { image_versions2: { candidates: [img("c2", 640)] } }] },
      { code: "c", image_versions2: { candidates: [] } },
    ]);
    expect(posts).toEqual([{ code: "a", caption: "Hola", image: "mid", year: "2026" }, { code: "b", caption: "", image: "c1", year: null }]);
  });
});

describe("followRows", () => {
  it("stores each followed account once (the API repeats accounts across pages, and one repeat used to lose the whole batch)", () => {
    const rows = followRows("u1", [{ username: "Galeria.Uno", full_name: "Uno" }, { username: "galeria.uno" }, { username: "otra" }], new Map([["galeria.uno", "n1"]]));
    expect(rows).toEqual([
      { user_id: "u1", handle: "galeria.uno", full_name: "Uno", node_id: "n1" },
      { user_id: "u1", handle: "otra", full_name: null, node_id: null },
    ]);
  });
});

describe("re-importing", () => {
  const post = { title: "A", image_url: "https://cdn/1.jpg?sig=1", source: "instagram.com/p/abc" };
  const site = { title: "B", image_url: "https://site.com/b.jpg", source: "https://site.com/" };
  it("identifies a work by its Instagram post or its image address, not by a signed CDN url that changes", () => {
    expect(workOrigin(post)).toBe("ig:abc");
    expect(workOrigin({ ...post, image_url: "https://cdn/1.jpg?sig=2" })).toBe("ig:abc");
    expect(workOrigin(site)).toBe("url:https://site.com/b.jpg");
  });
  it("offers only what was not imported before", () => {
    expect(newDraftWorks([post, site], ["ig:abc", "manual", null])).toEqual([site]);
    expect(newDraftWorks([post, site], [])).toEqual([post, site]);
  });
});

