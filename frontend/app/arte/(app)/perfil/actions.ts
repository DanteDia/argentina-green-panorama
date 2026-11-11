"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/arte/supabase-server";
import { loadStudio, slugify, upsertProfile } from "@/lib/arte/data";
import { complete } from "@/lib/arte/llm";
import { newCvItems, parseCv, readCvItems, type CvDraftItem } from "@/lib/arte/cv-parse";
import { draftText, suggestTags, translateText, type WriterKind } from "@/lib/arte/writer";
import { ownPaths } from "@/lib/arte/guards";
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
  const images = ownPaths(list(form.get("images")), user.id);
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
  const { error } = await supabase.from("arte_works").delete().eq("id", id);
  if (error) throw new Error(error.message);
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

// ---------- AI drafts: these only return text; the editor saves it when the artist presses Guardar ----------
// ponytail: no rate limit while the tool has a handful of users; add a per-user daily cap before opening sign-ups
async function writerStudio() {
  const { user, supabase } = await requireUser();
  const s = await loadStudio(supabase, user.id);
  if (!s.profile) throw new Error("Completá tu nombre primero");
  return { profile: s.profile, works: s.works, cv: s.cv, texts: s.texts };
}

export async function aiDraft(kind: WriterKind, notes: string): Promise<string | null> {
  return draftText(kind, await writerStudio(), notes, complete);
}

export async function aiTranslate(text: string): Promise<string | null> {
  await requireUser();
  return translateText(text.slice(0, 6000), complete);
}

export async function aiTags(): Promise<{ mediums: string[]; themes: string[] } | null> {
  return suggestTags(await writerStudio(), complete);
}

/** Reads a pasted CV into items for the artist to review. Null when the AI is unavailable. Saves nothing. */
export async function aiCvFromText(text: string): Promise<CvDraftItem[] | null> {
  await requireUser();
  return parseCv(text, complete);
}

/** Adds the reviewed items, skipping the ones the CV already has. The list comes from the client, so it is validated again. */
export async function addCvItems(items: CvDraftItem[]): Promise<number> {
  const { user, supabase } = await requireUser();
  const clean = readCvItems(JSON.stringify(items));
  const { data: have, error: readError } = await supabase.from("arte_cv_items").select("kind, title, year").eq("user_id", user.id);
  if (readError) throw new Error(readError.message);   // without the current CV we can't tell what is new
  const rows = newCvItems(clean, have || []).map((c) => ({ ...c, user_id: user.id, source: "import", confirmed: true }));
  if (rows.length) {
    const { error } = await supabase.from("arte_cv_items").insert(rows);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/arte/perfil/cv");
  return rows.length;
}

/** Bulk upload: one work per image already uploaded to the artist's own folder. Titles come from the browser, so they are capped. */
export async function addWorks(items: { path: string; title: string; year: string | null }[]): Promise<number> {
  const { user, supabase } = await requireUser();
  const mine = new Set(ownPaths(items.map((i) => String(i.path)), user.id));
  const rows = items.filter((i) => mine.has(i.path)).slice(0, 30).map((i, k) => ({
    user_id: user.id, title: String(i.title || "Obra sin título").slice(0, 200), year: /^(19|20)\d{2}$/.test(i.year ?? "") ? i.year : null,
    images: [i.path], sort: (Date.now() + k) % 1e9,
  }));
  if (rows.length) {
    const { error } = await supabase.from("arte_works").insert(rows);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/arte/perfil/obras");
  return rows.length;
}
