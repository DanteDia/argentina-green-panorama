import { expect, test } from "@playwright/test";
import { loginViaMagicLink } from "./helpers";

test("onboarding finds a known artist in the scene graph and imports her trajectory", async ({ page }) => {
  await loginViaMagicLink(page, `onb-${Date.now()}@example.invalid`);
  await expect(page).toHaveURL(/onboarding/);
  await page.getByLabel("Nombre").fill("Ana Gallardo");
  await page.getByLabel("Instagram").fill("@zz_esta_cuenta_no_existe_98765");
  await page.getByRole("button", { name: "Armar mi perfil" }).click();
  await expect(page.getByRole("heading", { name: "Esto es lo que encontramos" })).toBeVisible({ timeout: 45000 });
  await expect(page.getByText(/No pude leer tu Instagram/)).toBeVisible();
  await expect(page.getByText(/Trayectoria encontrada/)).toBeVisible();
  await page.getByRole("button", { name: "Confirmar y entrar" }).click();
  await expect(page).toHaveURL(/\/arte\/hoy/, { timeout: 30000 });
  await page.goto("/arte/perfil/cv");
  await expect(page.getByText("de la escena").first()).toBeVisible();
});

test("the import is rate limited per artist (paid Instagram API)", async ({ page }) => {
  await loginViaMagicLink(page, `rate-${Date.now()}@example.invalid`);
  const first = await page.request.post("/api/arte/import", { data: { name: "Nadie Particular" } });
  expect(first.status()).toBe(200);
  const second = await page.request.post("/api/arte/import", { data: { name: "Nadie Particular" } });
  expect(second.status()).toBe(429);
});

test("onboarding never imports from internal network addresses", async ({ page }) => {
  await loginViaMagicLink(page, `ssrf-${Date.now()}@example.invalid`);
  const r = await page.request.post("/api/arte/import", { data: { website: "http://127.0.0.1:54423/" } });
  expect(r.status()).toBe(200);
  const d = await r.json();
  expect(d.warnings.join(" ")).toMatch(/No pude leer tu web/);
  expect(d.texts.bio_long).toBeUndefined();
  expect(d.works).toEqual([]);
});
