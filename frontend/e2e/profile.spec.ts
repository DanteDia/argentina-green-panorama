import { expect, test } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { loginViaMagicLink } from "./helpers";

test("the artist saves their data, a work with image and a CV line, and it persists", async ({ page }) => {
  await loginViaMagicLink(page, `perfil-${Date.now()}@example.invalid`);

  await page.goto("/arte/perfil");
  await page.locator('input[name="name"]').fill("Artista de Prueba");
  await page.locator('input[name="base_city"]').fill("Buenos Aires");
  await page.getByRole("button", { name: "Guardar datos" }).click();
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(page.locator('input[name="name"]')).toHaveValue("Artista de Prueba");

  await page.goto("/arte/perfil/obras");
  const img = path.join(__dirname, "fixtures", "obra.png");
  if (!fs.existsSync(img)) {
    fs.mkdirSync(path.dirname(img), { recursive: true });
    // 1x1 png
    fs.writeFileSync(img, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
  }
  await page.locator('input[type="file"]').setInputFiles(img);
  await expect(page.getByText("Subiendo…")).toHaveCount(0, { timeout: 15000 });
  await page.getByLabel("Título").fill("Coof");
  await page.getByLabel("Técnica").fill("Cerámica escaneada");
  await page.getByLabel("Medidas").fill("30 x 20 x 20 cm");
  await page.getByRole("button", { name: "Guardar obra" }).click();
  await expect(page.getByText("Coof")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Coof")).toBeVisible();
  await expect(page.locator('img[alt="Coof"]')).toBeVisible();

  await page.goto("/arte/perfil/cv");
  await page.getByLabel("Tipo").selectOption("group");
  await page.getByLabel("Título").fill("Liminales Expandidas");
  await page.getByLabel("Institución").fill("Acéfala Galería");
  await page.getByLabel("Año").fill("2026");
  await page.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByText("Liminales Expandidas")).toBeVisible(); // wait for the server action before reloading
  await page.reload();
  await expect(page.getByText("Liminales Expandidas")).toBeVisible();
});

test("two artists with the same name can both save their profile", async ({ browser }) => {
  const name = `Homónimo ${Date.now()}`;
  for (const who of ["a", "b"]) {
    const page = await (await browser.newContext()).newPage();
    await loginViaMagicLink(page, `homonimo-${who}-${Date.now()}@example.invalid`);
    await page.goto("/arte/perfil");
    await page.locator('input[name="name"]').fill(name);
    await page.getByRole("button", { name: "Guardar datos" }).click();
    await page.waitForLoadState("networkidle");
    await page.reload();
    await expect(page.locator('input[name="name"]')).toHaveValue(name);
  }
});
