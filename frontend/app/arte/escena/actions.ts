"use server";
import { redirect } from "next/navigation";
import { createAdminSupabase } from "@/lib/arte/supabase-server";
import { decodeEntities, PUBLIC_CATEGORIES, UUID } from "@/lib/arte/escena";

const txt = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);

/** "Sumate": a gallerist, curator or artist asks to co-author their entry. Stored for the team to answer by hand. */
export async function claimNode(form: FormData) {
  const id = txt(form.get("node_id"), 40);
  if (!UUID.test(id)) redirect("/arte/escena");
  const back = `/arte/escena/${id}`;
  if (txt(form.get("website"), 10)) redirect(`${back}?gracias=1#sumate`);   // the hidden field only bots fill in
  const email = txt(form.get("email"), 200);
  const name = txt(form.get("name"), 200);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect(`${back}?falta=1#sumate`);
  const { error } = await createAdminSupabase().from("arte_claims").insert({
    node_id: id, name, email, role: txt(form.get("role"), 60) || null, message: txt(form.get("message"), 2000) || null,
  });
  if (error) { console.error("[arte/escena] claim", error.message); redirect(`${back}?error=1#sumate`); }
  redirect(`${back}?gracias=1#sumate`);
}

const KINDS = ["Corregir datos", "Sacar mis datos de contacto", "Borrar la ficha", "Saber qué datos tienen de mí"];

/** A correction or removal request (Ley 25.326) from /arte/datos. Stored in arte_claims with role "datos:<kind>". */
export async function requestCorrection(form: FormData) {
  if (txt(form.get("website"), 10)) redirect("/arte/datos?gracias=1#pedido");   // the hidden field only bots fill in
  const raw = txt(form.get("node_id"), 40);
  const db = createAdminSupabase();
  // only a public entry is kept: any other id would fail the foreign key and block the request for good
  const { data: node, error: lookup } = UUID.test(raw)
    ? await db.from("nodes").select("id, nombre").eq("id", raw).overlaps("industries", ["arte"]).in("categoria", PUBLIC_CATEGORIES).maybeSingle()
    : { data: null, error: null };
  if (lookup) console.error("[arte/datos] lookup", raw, lookup.message);
  const id: string | null = node?.id ?? null;
  const back = `/arte/datos?${id ? `ficha=${id}&` : ""}`;
  const email = txt(form.get("email"), 200);
  const name = txt(form.get("name"), 200);
  const message = txt(form.get("message"), 2000);
  if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect(`${back}falta=1#pedido`);
  const kind = KINDS.find((k) => k === txt(form.get("kind"), 60)) ?? KINDS[0];
  const { error } = await db.from("arte_claims").insert({
    node_id: id, name, email, role: `datos:${kind}`, message: lookup ? `[ficha ${raw}] ${message}` : message,
  });
  if (error) { console.error("[arte/datos] request", error.message); redirect(`${back}error=1#pedido`); }
  await notifyTeam(`Pedido de datos: ${kind}${node ? ` (${decodeEntities(node.nombre)})` : ""}`, `${name} <${email}>\n${kind}\n${id ? `${(process.env.NEXT_PUBLIC_SITE_URL || "https://industriesverified.com").replace(/\/$/, "")}/arte/escena/${id}\n` : ""}\n${message}`);
  redirect(`${back}gracias=1#pedido`);
}

/** The law gives 5 business days: each request is mailed to ARTE_ADMIN_EMAIL (through Resend) and always logged. */
async function notifyTeam(subject: string, text: string) {
  console.warn("[arte/datos] new request:", subject);
  const key = process.env.RESEND_API_KEY, to = process.env.ARTE_ADMIN_EMAIL;
  if (!key || !to) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.ARTE_MAIL_FROM || "Arte · IndustriesVerified <arte@industriesverified.com>", to, subject, text }),
      signal: AbortSignal.timeout(5000),   // a hung mail never keeps the visitor waiting: the request is already saved
    });
    if (!res.ok) console.error("[arte/datos] Resend", res.status, await res.text());
  } catch (e) { console.error("[arte/datos] Resend", e); }   // the request is saved; a failed mail never loses it
}
