import type { Page } from "@playwright/test";

const MAILPIT = process.env.ARTE_MAILPIT_URL || "http://127.0.0.1:54424";

/** Requests a magic link through the login page and follows it from the local mail catcher. */
export async function loginViaMagicLink(page: Page, email: string): Promise<void> {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
  await page.goto("/arte/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Enviarme el link" }).click();
  await page.getByText("Listo, revisá tu mail.").waitFor();
  let link = "";
  for (let i = 0; i < 20 && !link; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/messages`)).json();
    const msg = list.messages?.find((m: { To: { Address: string }[] }) => m.To.some((t) => t.Address === email));
    if (msg) {
      const full = await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json();
      link = (full.HTML.match(/href="([^"]+verify[^"]+)"/)?.[1] || "").replace(/&amp;/g, "&");
    }
    if (!link) await new Promise((r) => setTimeout(r, 500));
  }
  if (!link) throw new Error("no llegó el magic link");
  await page.goto(link);
}
