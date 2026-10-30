import { test } from "@playwright/test";
import { loginViaMagicLink } from "./helpers";

// Visual review only: SHOTS=1 to run. Screenshots land in test-results/screens (gitignored).
test.skip(!process.env.SHOTS, "visual review only");

test("screens", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await loginViaMagicLink(page, process.env.SHOTS_EMAIL || `shots-${Date.now()}@example.invalid`);
  for (const [path, name] of (process.env.SHOTS_PATHS || "/arte/hoy:hoy,/arte/oportunidades:oportunidades").split(",").map((x) => x.split(":"))) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: false });
  }
});
