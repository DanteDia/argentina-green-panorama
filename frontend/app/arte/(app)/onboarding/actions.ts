"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/arte/supabase-server";
import { slugify, upsertProfile } from "@/lib/arte/data";
import { findGraphNode } from "@/lib/arte/graph-match";
import { mergeProfile } from "@/lib/arte/guards";
import { safeFetch } from "@/lib/arte/safe-fetch";
import type { DraftProfile } from "@/lib/arte/import-map";
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
  await upsertProfile(supabase, { ...merged, user_id: user.id, name, slug: slugify(name) || null, onboarded_at: (existing as ArteProfile | null)?.onboarded_at ?? new Date().toISOString() });

  const texts = Object.entries(d.texts).filter(([, v]) => v && v.trim());
  for (const [kind, body] of texts) {
    const { data: prev } = await supabase.from("arte_texts").select("version").eq("user_id", user.id).eq("kind", kind).eq("lang", "es")
      .is("application_id", null).order("version", { ascending: false }).limit(1).maybeSingle();
    await supabase.from("arte_texts").insert({ user_id: user.id, kind, lang: "es", body: body!.trim(), version: (prev?.version ?? 0) + 1 });
  }

  const { data: cvNow } = await supabase.from("arte_cv_items").select("kind, title").eq("user_id", user.id);
  const have = new Set((cvNow || []).map((c) => `${c.kind}|${c.title}`));
  const nuevos = d.cv.filter((c) => !have.has(`${c.kind}|${c.title}`));
  if (nuevos.length) await supabase.from("arte_cv_items").insert(nuevos.map((c) => ({ user_id: user.id, kind: c.kind, title: c.title, org: c.org, year: c.year, source: CV_SOURCES.has(c.source) ? c.source : "import", confirmed: true })));

  const { count } = await supabase.from("arte_works").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  let sort = count ?? 0;
  for (const w of d.works.slice(0, 12)) {
    const r = await safeFetch(w.image_url, { maxBytes: 25 * 1024 * 1024, timeoutMs: 15000 });
    if (!r || !r.contentType.startsWith("image/")) continue;
    const path = `${user.id}/works/${crypto.randomUUID()}.${r.contentType.split("/")[1]?.split(";")[0] || "jpg"}`;
    const up = await supabase.storage.from("arte-private").upload(path, r.body, { contentType: r.contentType });
    if (up.error) continue;
    await supabase.from("arte_works").insert({ user_id: user.id, title: (w.title || "Obra sin título").slice(0, 200), images: [path], sort: sort++, source: "import" });
  }
  revalidatePath("/arte", "layout");
}
