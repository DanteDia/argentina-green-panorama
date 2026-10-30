"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/arte/supabase-server";
import { slugify, upsertProfile } from "@/lib/arte/data";
import type { DraftProfile } from "@/lib/arte/import-map";

/** Persist the parts of the draft the artist kept. Works' images are copied into private storage. */
export async function applyDraft(d: DraftProfile) {
  const { user, supabase } = await requireUser();
  const p = d.profile;
  const name = (p.name || "").trim();
  await upsertProfile(supabase, {
    user_id: user.id, name, slug: slugify(name) || null, node_id: d.graphNodeId, birth_year: p.birth_year ?? null,
    birth_place: p.birth_place ?? null, base_city: p.base_city ?? null, website: p.website ?? null, instagram: p.instagram ?? null,
    email_public: p.email_public ?? null, mediums: p.mediums ?? [], themes: p.themes ?? [], onboarded_at: new Date().toISOString(),
  });

  const texts = Object.entries(d.texts).filter(([, v]) => v && v.trim()).map(([kind, body]) => ({ user_id: user.id, kind, lang: "es", body: body!.trim(), version: 1 }));
  if (texts.length) await supabase.from("arte_texts").insert(texts);
  if (d.cv.length) await supabase.from("arte_cv_items").insert(d.cv.map((c) => ({ user_id: user.id, kind: c.kind, title: c.title, org: c.org, year: c.year, source: c.source, confirmed: true })));

  let sort = 0;
  for (const w of d.works.slice(0, 12)) {
    try {
      const r = await fetch(w.image_url, { signal: AbortSignal.timeout(15000) });
      const type = r.headers.get("content-type") || "image/jpeg";
      if (!r.ok || !type.startsWith("image/")) continue;
      const path = `${user.id}/works/${crypto.randomUUID()}.${type.split("/")[1]?.split(";")[0] || "jpg"}`;
      const up = await supabase.storage.from("arte-private").upload(path, await r.arrayBuffer(), { contentType: type });
      if (up.error) continue;
      await supabase.from("arte_works").insert({ user_id: user.id, title: w.title, images: [path], sort: sort++, source: "import" });
    } catch { /* skip images that cannot be fetched */ }
  }
  revalidatePath("/arte", "layout");
}
