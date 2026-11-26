// The weekly mail, "Lo nuevo para vos": calls that appeared since the artist's last mail and fit their profile, and
// calls closing in the next three weeks they have not applied to. Built from the same ranking as Oportunidades
// (rankPrograms already drops applied, closed and ineligible calls), so the mail never says something the tool doesn't.
import { createHmac, timingSafeEqual } from "node:crypto";
import { dueDate, formatDay } from "./dates";
import type { Ranked } from "./match";

export interface Digest { nuevas: Ranked[]; cierran: Ranked[] }

const SENDABLE = ["abierta", "cierra hoy", "próxima"];
const MAX = 5;
const SOON_DAYS = 21;

const addDays = (day: string, n: number) => new Date(Date.parse(day + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);

/** null when there is nothing to say: no mail is better than an empty one. */
export function buildDigest(ranked: Ranked[], since: string, today: string): Digest | null {
  const nuevas = ranked
    .filter((r) => r.program.first_seen_at && r.program.first_seen_at >= since && SENDABLE.includes(r.state.label))
    .slice(0, MAX);
  const ids = new Set(nuevas.map((r) => r.program.id));
  const limit = addDays(today, SOON_DAYS);
  const cierran = ranked
    .filter((r) => !ids.has(r.program.id) && !(r.program.opens_at && r.program.opens_at > today))
    .filter((r) => { const d = dueDate(r.program, today); return d !== null && d <= limit; })
    .sort((a, b) => a.program.closes_at!.localeCompare(b.program.closes_at!))
    .slice(0, MAX);
  return nuevas.length || cierran.length ? { nuevas, cierran } : null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function renderDigestEmail(d: Digest, o: { name: string; baseUrl: string; unsubscribeUrl: string }) {
  const first = o.name.trim().split(/\s+/)[0];
  const hola = first ? `Hola, ${first}` : "Hola";
  const n = d.nuevas.length;
  const subject = n
    ? `${n} convocatoria${n > 1 ? "s nuevas" : " nueva"} para vos`
    : `${d.cierran.length} cierre${d.cierran.length > 1 ? "s" : ""} en las próximas semanas`;
  const link = (r: Ranked) => `${o.baseUrl}/arte/oportunidades/${encodeURIComponent(r.program.id)}`;
  const when = (r: Ranked) => (r.program.closes_at ? `cierra el ${formatDay(r.program.closes_at)}` : r.state.text);
  const line = (r: Ranked) => [r.program.name, r.program.organizer, when(r)].filter(Boolean).join(" · ");

  const block = (title: string, list: Ranked[]) => !list.length ? "" : `
    <h2 style="font:600 13px system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#175c41;margin:28px 0 8px">${title}</h2>
    ${list.map((r) => `
    <p style="margin:0 0 14px;font:15px/1.45 system-ui,sans-serif;color:#17231c">
      <a href="${esc(link(r))}" style="color:#17231c;font-weight:600">${esc(r.program.name)}</a><br>
      <span style="color:#4d5c52">${esc([r.program.organizer, when(r)].filter(Boolean).join(" · "))}</span>
    </p>`).join("")}`;

  const html = `<!doctype html><html><body style="margin:0;background:#dfe9e1;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:28px">
    <p style="font:15px/1.45 system-ui,sans-serif;color:#17231c;margin:0">${esc(hola)}. Esto es lo que encontramos esta semana para tu perfil, sin las que ya postulaste.</p>
    ${block("Nuevas para vos", d.nuevas)}
    ${block("Cierran pronto", d.cierran)}
    <p style="margin:28px 0 0"><a href="${esc(o.baseUrl)}/arte/oportunidades" style="display:inline-block;background:#175c41;color:#fff;border-radius:999px;padding:10px 18px;font:500 14px system-ui,sans-serif;text-decoration:none">Ver todas</a></p>
  </div>
  <p style="max-width:560px;margin:14px auto 0;font:12px system-ui,sans-serif;color:#4d5c52">Te llega cada lunes porque tenés cuenta en Arte · <a href="${esc(o.unsubscribeUrl)}" style="color:#4d5c52">No recibir más este mail</a></p>
</body></html>`;

  const text = [
    `${hola}. Esto es lo que encontramos esta semana para tu perfil, sin las que ya postulaste.`,
    ...(d.nuevas.length ? ["", "NUEVAS PARA VOS", ...d.nuevas.map((r) => `- ${line(r)}\n  ${link(r)}`)] : []),
    ...(d.cierran.length ? ["", "CIERRAN PRONTO", ...d.cierran.map((r) => `- ${line(r)}\n  ${link(r)}`)] : []),
    "", `Ver todas: ${o.baseUrl}/arte/oportunidades`, "", `No recibir más este mail: ${o.unsubscribeUrl}`,
  ].join("\n");
  return { subject, html, text };
}

/** The unsubscribe link works without logging in, so it carries a signature only the server can make. */
export const unsubscribeToken = (userId: string, secret: string) => createHmac("sha256", secret).update("arte-baja:" + userId).digest("hex").slice(0, 32);

export function validUnsubscribe(userId: string, token: string, secret: string): boolean {
  const want = Buffer.from(unsubscribeToken(userId, secret));
  const got = Buffer.from(token || "");
  return got.length === want.length && timingSafeEqual(got, want);
}
