import { describe, expect, it } from "vitest";
import { assembleDossier, draftLetter, type DossierCtx } from "../dossier";
import type { ArteWork } from "../types";
import { perfil, programa } from "./fixtures";

const obra = (i: number, o: Partial<ArteWork> = {}): ArteWork => ({
  id: `w${i}`, user_id: "u", title: `Obra ${i}`, year: "2024", technique: "óleo sobre tela", dimensions: null, series: null,
  description: null, images: [`u/works/${i}.jpg`], sort: i, public: false, ...o,
});

const ctx = (o: Partial<DossierCtx> = {}): DossierCtx => ({
  profile: perfil(),
  works: Array.from({ length: 30 }, (_, i) => obra(i)),
  cv: [],
  texts: { statement: { es: "Mi obra trabaja el umbral entre materia y dato." }, bio_long: { es: "Dante Arola (Buenos Aires, 1993)." } },
  program: programa({ name: "Beca Arte y Tecnología 2027", description: "Para proyectos de arte digital e instalación con datos.", requirements: { images_n: 10, pdf_mb_max: 10 } }),
  ...o,
});

describe("assembleDossier", () => {
  it("selects exactly images_n works, the ones closest to the call first", () => {
    const works = Array.from({ length: 30 }, (_, i) => obra(i));
    works[17] = obra(17, { title: "Umbral de datos", technique: "instalación digital" });
    works[23] = obra(23, { technique: "arte digital, datos" });
    const d = assembleDossier(ctx({ works }));
    expect(d.sections.works).toHaveLength(10);
    expect(d.sections.works.slice(0, 2).map((w) => w.id).sort()).toEqual(["w17", "w23"]);
  });

  it("keeps the image budget under the file-size limit with a 5% margin", () => {
    const d = assembleDossier(ctx());
    expect(d.limits.mb_max).toBe(10);
    expect(d.limits.image_budget_bytes!).toBeLessThanOrEqual(9.5 * 1024 * 1024);
  });

  it("names the file 'Nombre Apellido - postulación a <Programa>.pdf'", () => {
    expect(assembleDossier(ctx()).fileName).toBe("Dante Arola - postulación a Beca Arte y Tecnología 2027.pdf");
  });

  it("strips characters that break file names", () => {
    const d = assembleDossier(ctx({ program: programa({ name: "Premio A/B: 2027" }) }));
    expect(d.fileName).toBe("Dante Arola - postulación a Premio A-B 2027.pdf");
  });
});

describe("draftLetter", () => {
  it("without an AI key, writes a template letter with the statement and two real work titles", async () => {
    const works = [obra(1, { title: "Cuerpo umbral" }), obra(2, { title: "Lo que el dato no dice" })];
    const r = await draftLetter(ctx({ works }), async () => null);
    expect(r.usedAI).toBe(false);
    expect(r.text).toContain("umbral entre materia y dato");
    expect(r.text).toContain("Cuerpo umbral");
    expect(r.text).toContain("Lo que el dato no dice");
    expect(r.text).toContain("Beca Arte y Tecnología 2027");
  });

  it("uses the AI text when available", async () => {
    const r = await draftLetter(ctx(), async () => "Estimado jurado: carta generada.");
    expect(r).toEqual({ text: "Estimado jurado: carta generada.", usedAI: true });
  });
});
