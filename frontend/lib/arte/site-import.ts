import "server-only";
import type { SiteImport } from "./import-map";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36";

async function get(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, "accept-language": "es-AR,es;q=0.9" }, signal: AbortSignal.timeout(12000), redirect: "follow" });
    if (!r.ok || !(r.headers.get("content-type") || "").includes("html")) return null;
    return await r.text();
  } catch {
    return null;
  }
}

const strip = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<\/(p|div|h\d|li|section|article)>/gi, "\n\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*/g, "\n\n").trim();

/** Text of the home + bio/about page, plus artwork-sized images (no logos/icons). */
export async function importSite(url: string): Promise<SiteImport | { error: string }> {
  let u: URL;
  try { u = new URL(/^https?:\/\//.test(url) ? url : `https://${url}`); } catch { return { error: "URL inválida" }; }
  const home = await get(u.href);
  if (!home) return { error: "no responde" };
  const links = [...home.matchAll(/href="([^"#]+)"/g)].map((m) => { try { return new URL(m[1], u).href; } catch { return ""; } })
    .filter((l) => l && new URL(l).host === u.host);
  const bioPage = links.find((l) => /bio|about|acerca|sobre|cv|statement/i.test(new URL(l).pathname));
  const bio = bioPage ? await get(bioPage) : null;
  const html = home + (bio || "");
  const images = [...html.matchAll(/<img[^>]+(?:data-src|src)="([^"]+)"[^>]*>/gi)]
    .map((m) => { try { return new URL(m[1], u).href; } catch { return ""; } })
    .filter((s) => s && !/logo|icon|sprite|avatar|favicon|\.svg|\.gif|pixel|blank/i.test(s));
  return { url: u.href, text: strip(bio ? bio + "\n\n" + home : home).slice(0, 20000), images: [...new Set(images)].slice(0, 30), pages: [u.href, ...(bioPage ? [bioPage] : [])] };
}
