import { expect, test } from "@playwright/test";
import { loginViaMagicLink } from "./helpers";

test("the artist sees ranked opportunities with reasons and can open one", async ({ page }) => {
  await loginViaMagicLink(page, `opps-${Date.now()}@example.invalid`);
  await page.goto("/arte/perfil");
  await page.locator('input[name="name"]').fill("Artista Digital");
  await page.locator('input[name="mediums"]').fill("instalación, arte digital");
  await page.locator('input[name="themes"]').fill("identidad, tecnología, dato");
  await page.getByRole("button", { name: "Guardar datos" }).click();
  await page.waitForLoadState("networkidle");

  await page.goto("/arte/oportunidades");
  await expect(page.getByRole("heading", { name: "A qué te conviene postularte" })).toBeVisible();
  const cards = page.locator('a[href^="/arte/oportunidades/"]');
  expect(await cards.count()).toBeGreaterThan(5);
  await expect(page.getByText("afinidad").first()).toBeVisible();

  await page.goto("/arte/oportunidades?digital=1");
  expect(await cards.count()).toBeGreaterThan(0);
  await cards.first().click();
  await expect(page.getByRole("heading", { name: "Por qué te la recomendamos" })).toBeVisible();
  await expect(page.getByText(/Fuente:/)).toBeVisible();

  await page.goto("/arte/hoy");
  await expect(page.getByRole("heading", { name: "Para vos, ahora" })).toBeVisible();
});
