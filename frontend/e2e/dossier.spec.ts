import { expect, test } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import sharp from "sharp";
import { loginViaMagicLink } from "./helpers";

const PROGRAM = {
  id: "e2e-dossier-program", name: "Beca de Prueba: Dossier", type: "Beca", organizer: "Fundación Test", country: "Argentina",
  description: "Convocatoria para fotografía e instalación.", eligibility: {}, evidence: {}, source: "e2e",
  requirements: { letter: true, images_n: 3, pdf_mb_max: 2 }, closes_at: "2027-01-20", verified_at: "2026-10-30",
};

test.beforeAll(async () => {
  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/arte_programs?on_conflict=id`, {
    method: "POST",
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json", prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(PROGRAM),
  });
  if (!r.ok) throw new Error(`seed program: ${r.status} ${await r.text()}`);
});

test("the dossier exports a PDF under the call's size limit with the right file name", async ({ page }) => {
  test.setTimeout(120_000);
  await loginViaMagicLink(page, `dossier-${Date.now()}@example.invalid`);
  await page.goto("/arte/perfil");
  await page.locator('input[name="name"]').fill("Ana Prueba");
  await page.getByRole("button", { name: "Guardar datos" }).click();
  await page.waitForLoadState("networkidle");

  // Three heavy photos (~3 MB each): the export has to shrink them to fit 2 MB in total
  await page.goto("/arte/perfil/obras");
  for (let i = 1; i <= 3; i++) {
    const file = path.join(__dirname, "fixtures", `pesada-${i}.jpg`);
    if (!fs.existsSync(file)) await sharp({ create: { width: 2400, height: 1800, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 60 } } }).jpeg({ quality: 95 }).toFile(file);
    if (i > 1) await page.getByRole("button", { name: "+ Nueva obra" }).click();
    await page.locator('input[type="file"]').setInputFiles(file);
    await expect(page.getByText("Subiendo…")).toHaveCount(0, { timeout: 20000 });
    await page.getByLabel("Título").fill(`Fotografía ${i}`);
    await page.getByRole("button", { name: "Guardar obra" }).click();
    await expect(page.getByText(`Fotografía ${i}`)).toBeVisible();
  }

  await page.goto(`/arte/oportunidades/${PROGRAM.id}`);
  await page.getByRole("button", { name: "Postularme" }).click();
  await expect(page).toHaveURL(/\/arte\/postulaciones\/[0-9a-f-]{36}$/);
  await page.getByText("Armar mi postulación →").click();
  await expect(page.getByRole("heading", { name: "Tu dossier" })).toBeVisible();
  await expect(page.getByText("Ana Prueba - postulación a Beca de Prueba Dossier.pdf")).toBeVisible();
  await expect(page.getByText("3/3")).toBeVisible();

  await page.getByRole("button", { name: "Generar borrador" }).click();
  await expect(page.getByLabel("Carta de motivación")).toHaveValue(/Beca de Prueba: Dossier/, { timeout: 60000 });
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Guardado" })).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.getByRole("link", { name: "Descargar PDF" }).click()]);
  expect(download.suggestedFilename()).toBe("Ana Prueba - postulación a Beca de Prueba Dossier.pdf");
  await download.saveAs("test-results/dossier.pdf");
  const pdf = fs.readFileSync("test-results/dossier.pdf");
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  expect(pdf.length).toBeLessThan(2 * 1024 * 1024);
  expect(pdf.length).toBeGreaterThan(100 * 1024); // the images are in there
});
