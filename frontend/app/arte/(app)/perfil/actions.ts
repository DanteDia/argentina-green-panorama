"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/arte/supabase-server";
import { slugify, upsertProfile } from "@/lib/arte/data";
import type { CvKind, Lang, TextKind } from "@/lib/arte/types";

const list = (v: FormDataEntryValue | null) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean);
const txt = (v: FormDataEntryValue | null) => (String(v ?? "").trim() || null);

export async function saveProfile(form: FormData) {
  const { user, supabase } = await requireUser();
  const name = String(form.get("name") || "").trim();
  const row = {
    user_id: user.id, name, slug: slugify(name) || null,
    birth_year: Number(form.get("birth_year")) || null, birth_place: txt(form.get("birth_place")), base_city: txt(form.get("base_city")),
    nationality: txt(form.get("nationality")) || "AR", residence: txt(form.get("residence")) || "AR",
    website: txt(form.get("website")), instagram: txt(form.get("instagram"))?.replace(/^@/, "") ?? null, email_public: txt(form.get("email_public")),
    mediums: list(form.get("mediums")), themes: list(form.get("themes")),
    career_stage: String(form.get("career_stage") || "emerging"), monthly_budget: Number(form.get("monthly_budget")) || 2,
    portfolio_public: form.get("portfolio_public") === "on", updated_at: new Date().toISOString(),
  };
  await upsertProfile(supabase, row);
  revalidatePath("/arte", "layout");
}

export async function saveText(kind: Exclude<TextKind, "letter">, lang: Lang, body: string) {
  const { user, supabase } = await requireUser();
  const { data: prev } = await supabase.from("arte_texts").select("version").eq("user_id", user.id).eq("kind", kind).eq("lang", lang)
    .is("application_id", null).order("version", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("arte_texts").insert({ user_id: user.id, kind, lang, body: body.trim(), version: (prev?.version || 0) + 1 });
  if (error) throw new Error(error.message);
  revalidatePath("/arte/perfil");
}

export async function upsertWork(form: FormData) {
  const { user, supabase } = await requireUser();
  const id = txt(form.get("id"));
  const images = list(form.get("images"));
  const row = {
    user_id: user.id, title: String(form.get("title") || "Sin título").trim(), year: txt(form.get("year")), technique: txt(form.get("technique")),
    dimensions: txt(form.get("dimensions")), series: txt(form.get("series")), description: txt(form.get("description")),
    images, public: form.get("public") === "on",
  };
  const q = id ? supabase.from("arte_works").update(row).eq("id", id) : supabase.from("arte_works").insert({ ...row, sort: Date.now() % 1e9 });
  const { error } = await q;
  if (error) throw new Error(error.message);
  revalidatePath("/arte/perfil/obras");
}

export async function reorderWorks(ids: string[]) {
  const { supabase } = await requireUser();
  await Promise.all(ids.map((id, i) => supabase.from("arte_works").update({ sort: i }).eq("id", id)));
  revalidatePath("/arte/perfil/obras");
}

export async function deleteWork(id: string) {
  const { supabase } = await requireUser();
  await supabase.from("arte_works").delete().eq("id", id);
  revalidatePath("/arte/perfil/obras");
}

export async function upsertCvItem(form: FormData) {
  const { user, supabase } = await requireUser();
  const id = txt(form.get("id"));
  const row = {
    user_id: user.id, kind: String(form.get("kind")) as CvKind, title: String(form.get("title") || "").trim(), org: txt(form.get("org")),
    city: txt(form.get("city")), country: txt(form.get("country")), year: txt(form.get("year")), link: txt(form.get("link")), confirmed: true,
  };
  if (!row.title) return;
  const { error } = id ? await supabase.from("arte_cv_items").update(row).eq("id", id) : await supabase.from("arte_cv_items").insert(row);
  if (error) throw new Error(error.message);
  revalidatePath("/arte/perfil/cv");
}

export async function deleteCvItem(id: string) {
  const { supabase } = await requireUser();
  await supabase.from("arte_cv_items").delete().eq("id", id);
  revalidatePath("/arte/perfil/cv");
}
