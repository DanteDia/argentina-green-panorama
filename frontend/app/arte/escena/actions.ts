"use server";
import { redirect } from "next/navigation";
import { createAdminSupabase } from "@/lib/arte/supabase-server";
import { PUBLIC_CATEGORIES, UUID } from "@/lib/arte/escena";

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

const KINDS = ["Corregir datos", "Sacar mis datos de contacto", "Borrar la ficha"];

/** A correction or removal request (Ley 25.326) from /arte/datos. Stored in arte_claims with the kind as its role. */
export async function requestCorrection(form: FormData) {
  const raw = txt(form.get("node_id"), 40);
  const db = createAdminSupabase();
  // only a public entry is kept: any other id would fail the foreign key and block the request for good
  const { data: node } = UUID.test(raw) ? await db.from("nodes").select("id").eq("id", raw).overlaps("industries", ["arte"]).in("categoria", PUBLIC_CATEGORIES).maybeSingle() : { data: null };
  const id: string | null = node?.id ?? null;
  const back = `/arte/datos?${id ? `ficha=${id}&` : ""}`;
  if (txt(form.get("website"), 10)) redirect(`${back}gracias=1#pedido`);
  const email = txt(form.get("email"), 200);
  const name = txt(form.get("name"), 200);
  const message = txt(form.get("message"), 2000);
  if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect(`${back}falta=1#pedido`);
  const kind = txt(form.get("kind"), 60);
  const { error } = await db.from("arte_claims").insert({
    node_id: id, name, email, role: KINDS.includes(kind) ? kind : KINDS[0], message,
  });
  if (error) { console.error("[arte/datos] request", error.message); redirect(`${back}error=1#pedido`); }
  redirect(`${back}gracias=1#pedido`);
}
