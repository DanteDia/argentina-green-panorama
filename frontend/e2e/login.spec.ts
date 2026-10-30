import { expect, test } from "@playwright/test";
import { loginViaMagicLink } from "./helpers";

test("magic link logs the artist in and opens the app", async ({ page }) => {
  await loginViaMagicLink(page, `login-${Date.now()}@example.invalid`);
  // first visit lands on onboarding; the session must already be valid for the app shell
  await expect(page).toHaveURL(/\/arte\/onboarding/);
  await page.goto("/arte/hoy");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hola");
});
