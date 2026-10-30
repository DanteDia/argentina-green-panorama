import { expect, test } from "@playwright/test";
import { loginViaMagicLink } from "./helpers";

test("start an application, tick the checklist, get selected and see it in the CV", async ({ page }) => {
  await loginViaMagicLink(page, `apps-${Date.now()}@example.invalid`);
  await page.goto("/arte/oportunidades?estado=abierta");
  await page.locator('a[href^="/arte/oportunidades/"]').first().click();
  await expect(page.getByRole("heading", { name: "Por qué te la recomendamos" })).toBeVisible();
  const programa = (await page.locator("h1").textContent())!.trim();
  await page.getByRole("button", { name: "Postularme" }).click();

  await expect(page).toHaveURL(/\/arte\/postulaciones\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Qué falta" })).toBeVisible();
  await expect(page.getByText("Enviar postulación")).toBeVisible();
  await page.getByRole("checkbox").first().check();
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(page.getByRole("checkbox").first()).toBeChecked();

  await page.getByRole("button", { name: "Seleccionado" }).click();
  await page.waitForLoadState("networkidle");
  await page.goto("/arte/postulaciones");
  await expect(page.getByRole("heading", { name: /Seleccionado · 1/ })).toBeVisible();
  await page.goto("/arte/perfil/cv");
  await expect(page.getByText(programa).first()).toBeVisible();

  await page.goto("/arte/plan");
  await expect(page.getByRole("heading", { name: "Tu temporada" })).toBeVisible();
});
