import { describe, expect, it } from "vitest";
import { cleanWorkItems, workFromFilename } from "../works";

describe("workFromFilename", () => {
  it("turns a named file into a title, and picks up the year", () => {
    expect(workFromFilename("mi-obra_final 2.JPG")).toEqual({ title: "Mi obra final 2", year: null });
    expect(workFromFilename("Umbral (2025).png")).toEqual({ title: "Umbral", year: "2025" });
    expect(workFromFilename("umbral_2024_oleo.jpeg")).toEqual({ title: "Umbral oleo", year: "2024" });
    expect(workFromFilename("Sin título 3.webp")).toEqual({ title: "Sin título 3", year: null });
  });

  it("does not use a camera or app file name as a title, nor its date as the work's year", () => {
    for (const f of ["IMG_1234.jpg", "DSC00123.png", "PXL_20260101_120000.jpg", "WhatsApp Image 2026-01-01 at 10.00.00.jpeg", "Screenshot 2026-03-04 at 11.22.33.png",
      "image0.jpeg", "20260101_120000.jpg", "9f3c2a1e-77aa-4b1c-8d2e-1a2b3c4d5e6f.jpg", "photo.jpg", "1.png"]) {
      expect(workFromFilename(f), f).toEqual({ title: "Obra sin título", year: null });
    }
  });

  it("handles what phones and chat apps really produce, in Spanish too, including copies", () => {
    for (const f of ["IMG-20240101-WA0001.jpg", "Imagen de WhatsApp 2026-01-01 a las 10.00.00.jpeg", "Captura de pantalla 2026-03-04 a las 11.22.33.png",
      "WhatsApp Image 2026-01-01 at 10.00.00 (1).jpeg", "Screenshot 2026-03-04 at 11.22.33 AM.png", "IMG_1234 (1).jpg", "_MG_1234.jpg", "IMG_1234 copy.jpg", "Foto 12.jpg"]) {
      expect(workFromFilename(f), f).toEqual({ title: "Obra sin título", year: null });
    }
  });

  it("keeps real words next to numbers, and never reads a date or a pixel size as the work's year", () => {
    expect(workFromFilename("Retrato de mi clon 2.jpg")).toEqual({ title: "Retrato de mi clon 2", year: null });
    expect(workFromFilename("Umbral 1920x1080.png")).toEqual({ title: "Umbral", year: null });
    expect(workFromFilename("Umbral 2026-01-01.png")).toEqual({ title: "Umbral", year: null });
    expect(workFromFilename("Umbral_2025 (1).png")).toEqual({ title: "Umbral", year: "2025" });
  });

  it("caps the title length", () => {
    expect(workFromFilename(`${"palabra ".repeat(60)}.jpg`).title.length).toBeLessThanOrEqual(120);
  });
});

describe("cleanWorkItems", () => {
  it("keeps only images in the artist's own folder and tolerates junk from the browser", () => {
    const out = cleanWorkItems([
      { path: "u1/works/a.jpg", title: "  Umbral  ", year: "2025" },
      { path: "u2/works/b.jpg", title: "Ajena", year: null },
      { path: "u1/../u2/c.jpg", title: "Truco", year: null },
      null, { path: "u1/works/d.jpg", title: "   ", year: 2025 }, { path: 7, title: "x", year: null },
    ] as never, "u1");
    expect(out).toEqual([{ path: "u1/works/a.jpg", title: "Umbral", year: "2025" }, { path: "u1/works/d.jpg", title: "Obra sin título", year: null }]);
  });
  it("caps how many go in at once", () => {
    expect(cleanWorkItems(Array.from({ length: 50 }, (_, i) => ({ path: `u1/works/${i}.jpg`, title: "t", year: null })), "u1")).toHaveLength(30);
  });
});

