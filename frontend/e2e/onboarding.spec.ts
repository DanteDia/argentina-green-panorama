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
