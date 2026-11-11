import { describe, expect, it } from "vitest";
import { workFromFilename } from "../works";

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

  it("caps the title length", () => {
    expect(workFromFilename(`${"palabra ".repeat(60)}.jpg`).title.length).toBeLessThanOrEqual(120);
  });
});
