import { expect, test } from "@playwright/test";
import { loginViaMagicLink } from "./helpers";

// 1x1 PNG: enough for the upload; what is under test is the flow, not the image
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const file = (name: string, mimeType = "image/png") => ({ name, mimeType, buffer: PNG });

test("an artist uploads several works at once, gets titles from real file names, and removes one that is not a work", async ({ page }) => {
  test.setTimeout(90_000);
  await loginViaMagicLink(page, `obras-${Date.now()}@example.invalid`);
  await page.getByLabel("Nombre").fill(`Obras ${Date.now()}`);
  await page.getByRole("button", { name: "Prefiero cargarlo a mano" }).click();
  await page.getByRole("button", { name: "Confirmar y entrar" }).click();
  await expect(page).toHaveURL(/\/arte\/hoy/, { timeout: 30000 });

  await page.goto("/arte/perfil/obras");
  await page.locator('input[aria-label="Elegir imágenes de obras"]').setInputFiles([
    file("Umbral (2025).png"), file("IMG-20240101-WA0001.png"), file("retrato-de-mi-clon.png"), file("notas.txt", "text/plain"),
  ]);
  await expect(page.getByRole("status")).toContainText("Listo: 3 obras nuevas", { timeout: 40000 });
  await expect(page.getByRole("status")).toContainText("1 quedó afuera");
  await expect(page.getByRole("button", { name: "Editar Umbral" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar Retrato de mi clon" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar Obra sin título" })).toBeVisible();

  // the phone photo is not a work: two clicks, without opening its form
  const card = page.locator(".card", { has: page.getByRole("button", { name: "Editar Obra sin título" }) });
  await card.getByRole("button", { name: "No es una obra" }).click();
  await card.getByRole("button", { name: "Sí" }).click();
  await expect(page.getByRole("button", { name: "Editar Obra sin título" })).toHaveCount(0);
  await expect(page.getByText("2 obras ·")).toBeVisible();
});
