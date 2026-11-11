"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/arte/supabase-server";
import { slugify, upsertProfile } from "@/lib/arte/data";
import { findGraphNode } from "@/lib/arte/graph-match";
import { mergeProfile } from "@/lib/arte/guards";
import { safeFetch } from "@/lib/arte/safe-fetch";
import { cut, newDraftWorks, workOrigin, type DraftProfile } from "@/lib/arte/import-map";
import type { ArteProfile } from "@/lib/arte/types";

const CV_SOURCES = new Set(["graph", "import"]);

/** Persist the parts of the draft the artist kept. The draft comes from the client, so nothing in it is trusted:
 *  the graph node is re-matched here, existing data is never blanked, images go through the SSRF-safe fetch. */
export async function applyDraft(d: DraftProfile) {
  const { user, supabase } = await requireUser();
  const { data: existing } = await supabase.from("arte_profiles").select("*").eq("user_id", user.id).maybeSingle();
  const p = d.profile;
  const node = await findGraphNode(supabase, p.instagram ?? null, p.name ?? null);
  const merged = mergeProfile(existing as ArteProfile | null, { ...p, node_id: node?.id ?? null });
  const name = (merged.name || "").trim();
  const prev = existing as ArteProfile | null;
  await upsertProfile(supabase, { ...merged, user_id: user.id, name, slug: prev?.slug ?? (slugify(name) || null), onboarded_at: (existing as ArteProfile | null)?.onboarded_at ?? new Date().toISOString() });

  // Imported texts only fill kinds the artist has not written yet; an edited bio is never replaced by an import
  const { data: written } = await supabase.from("arte_texts").select("kind").eq("user_id", user.id).eq("lang", "es").is("application_id", null);
  const has = new Set((written || []).map((t) => t.kind));
  const texts = Object.entries(d.texts).filter(([kind, v]) => v && v.trim() && !has.has(kind) && ["bio_short", "bio_long", "statement"].includes(kind));
  if (texts.length) await supabase.from("arte_texts").insert(texts.map(([kind, body]) => ({ user_id: user.id, kind, lang: "es", body: body!.trim(), version: 1 })));

  const { data: cvNow } = await supabase.from("arte_cv_items").select("kind, title").eq("user_id", user.id);
  const have = new Set((cvNow || []).map((c) => `${c.kind}|${c.title}`));
  const nuevos = d.cv.filter((c) => !have.has(`${c.kind}|${c.title}`));
  if (nuevos.length) await supabase.from("arte_cv_items").insert(nuevos.map((c) => ({ user_id: user.id, kind: c.kind, title: c.title, org: c.org, year: c.year, source: CV_SOURCES.has(c.source) ? c.source : "import", confirmed: true })));

  const { data: mine } = await supabase.from("arte_works").select("source").eq("user_id", user.id);
  const count = mine?.length ?? 0;
  const fresh = newDraftWorks(d.works, (mine || []).map((w) => w.source));   // importing again never duplicates a work
  // downloads run together (each is capped at 15 s); rows are inserted in the order the artist saw them
  const got = await Promise.all(fresh.slice(0, 12).map(async (w) => {
    const r = await safeFetch(w.image_url, { maxBytes: 10 * 1024 * 1024, timeoutMs: 15000 });
    if (!r || !r.contentType.startsWith("image/")) return null;
    const path = `${user.id}/works/${crypto.randomUUID()}.${r.contentType.split("/")[1]?.split(";")[0] || "jpg"}`;
    const up = await supabase.storage.from("arte-private").upload(path, r.body, { contentType: r.contentType });
    return up.error ? null : { w, path };
  }));
  const rows = got.filter((x) => x !== null).map(({ w, path }, i) => ({
    user_id: user.id, title: cut(w.title || "Obra sin título", 200), description: (w.description && cut(w.description, 1500)) || null,
    year: /^\d{4}$/.test(w.year ?? "") ? w.year : null, images: [path], sort: count + i, source: workOrigin(w),
  }));
  if (rows.length) {
    const { error } = await supabase.from("arte_works").insert(rows);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/arte", "layout");
}
