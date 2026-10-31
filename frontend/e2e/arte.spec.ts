import { expect, test } from "@playwright/test";
import { loginViaMagicLink } from "./helpers";

test("smoke: a new artist goes from login to a downloadable dossier", async ({ page }) => {
  test.setTimeout(90_000);
  await loginViaMagicLink(page, `smoke-${Date.now()}@example.invalid`);
  await expect(page).toHaveURL(/onboarding/);
  await page.getByLabel("Nombre").fill(`Smoke ${Date.now()}`);
  await page.getByRole("button", { name: "Prefiero cargarlo a mano" }).click();
  await page.getByRole("button", { name: "Confirmar y entrar" }).click();
  await expect(page).toHaveURL(/\/arte\/hoy/, { timeout: 30000 });

  await page.goto("/arte/oportunidades?estado=abierta");
  await page.locator('a[href^="/arte/oportunidades/"]').first().click();
  await expect(page.getByRole("heading", { name: "Por qué te la recomendamos" })).toBeVisible();
  await page.getByRole("button", { name: "Postularme" }).click();
  await expect(page).toHaveURL(/\/arte\/postulaciones\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop();

  const res = await page.request.get(`/api/arte/dossier/${id}`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");

  for (const path of ["/arte/plan", "/arte/descubrir", "/arte/mapa", "/arte/postulaciones"]) {
    const r = await page.goto(path);
    expect(r?.status(), path).toBe(200);
  }
});
