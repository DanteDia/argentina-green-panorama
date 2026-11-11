import { expect, test } from "@playwright/test";
import { loginViaMagicLink } from "./helpers";

test("an artist creates a show, opens a Gmail invite and records it as sent", async ({ page }) => {
  test.setTimeout(90_000);
  await loginViaMagicLink(page, `invitar-${Date.now()}@example.invalid`);
  await page.getByLabel("Nombre").fill(`Invita ${Date.now()}`);
  await page.getByRole("button", { name: "Prefiero cargarlo a mano" }).click();
  await page.getByRole("button", { name: "Confirmar y entrar" }).click();
  await expect(page).toHaveURL(/\/arte\/hoy/, { timeout: 30000 });

  await page.getByRole("link", { name: "Invitar" }).click();
  await page.getByLabel("Nombre de la muestra").fill("Frecuencias Híbridas");
  await page.getByLabel("Espacio").fill("Acéfala Galería");
  await page.getByLabel("Cuándo").fill("jueves 12/11, 18 a 21 h");
  await page.getByRole("button", { name: "Crear muestra" }).click();
  await expect(page).toHaveURL(/muestra=[0-9a-f-]{36}/);

  await page.getByLabel("Nombre del invitado").fill("Lucía Pérez");
  await page.getByLabel("Mail o Instagram").fill("lucia@example.invalid");
  const gmail = page.getByRole("link", { name: "Abrir en Gmail" });
  const href = new URL((await gmail.getAttribute("href"))!);
  expect(href.searchParams.get("to")).toBe("lucia@example.invalid");
  expect(href.searchParams.get("su")).toBe("Te invito a Frecuencias Híbridas, jueves 12/11, 18 a 21 h");
  expect(href.searchParams.get("body")).toContain("Hola Lucía,");

  await page.getByRole("button", { name: "Ya la mandé" }).click();
  await expect(page.getByRole("heading", { name: "Ya invitaste (1)" })).toBeVisible();
  await expect(page.getByText("lucia@example.invalid")).toBeVisible();
});
