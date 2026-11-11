import { expect, test } from "@playwright/test";
import { loginViaMagicLink } from "./helpers";

// Every screen of the tool renders for a new artist, without script errors, and fits a phone.
// Catches what unit tests and the type check can't: a server-only import in a client bundle, a page that throws, a layout that overflows.
const PAGES = ["/arte/hoy", "/arte/oportunidades", "/arte/plan", "/arte/postulaciones", "/arte/perfil", "/arte/perfil/obras", "/arte/perfil/cv",
  "/arte/descubrir", "/arte/invitar", "/arte/mapa", "/arte/onboarding"];

test("tour: every page renders without errors and fits a 390px phone", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`${page.url()} ${e.message}`));
  await loginViaMagicLink(page, `tour-${Date.now()}@example.invalid`);
  await page.getByLabel("Nombre").fill(`Tour ${Date.now()}`);
  await page.getByRole("button", { name: "Prefiero cargarlo a mano" }).click();
  await page.getByRole("button", { name: "Confirmar y entrar" }).click();
  await expect(page).toHaveURL(/\/arte\/hoy/, { timeout: 30000 });

  // an application, so the detail, the dossier and the calendar have something to show
  await page.goto("/arte/oportunidades?estado=abierta");
  await page.locator('a[href^="/arte/oportunidades/"]').first().click();
  await expect(page.getByRole("heading", { name: "Por qué te la recomendamos" })).toBeVisible();
  const opportunity = new URL(page.url()).pathname;
  await page.getByRole("button", { name: "Postularme" }).click();
  await expect(page).toHaveURL(/\/arte\/postulaciones\/[0-9a-f-]{36}$/);
  const application = new URL(page.url()).pathname;
  await expect(page.getByRole("link", { name: /Hacerlo|Abrir/ }).first()).toBeVisible();   // checklist steps lead somewhere

  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [...PAGES, opportunity, application, `${application}/dossier`]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await page.waitForLoadState("networkidle").catch(() => {});
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${path} overflows a phone`).toBeLessThanOrEqual(390);
  }
  expect(errors).toEqual([]);

  const ics = await page.request.get("/api/arte/calendario");
  // the call may have no closing date (then there is nothing to add to a calendar): both answers are valid, a 500 is not
  expect([200, 404]).toContain(ics.status());
  if (ics.status() === 200) expect(await ics.text()).toContain("BEGIN:VEVENT");
});
