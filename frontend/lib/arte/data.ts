import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ArteProfile, ArteText, ArteWork, CvItem, TextSet } from "./types";

export interface Studio {
  profile: ArteProfile | null;
  works: ArteWork[];
  cv: CvItem[];
  texts: TextSet;
  rawTexts: ArteText[];
}

/** Everything the artist has entered, in one round of queries (RLS limits it to their own rows). */
export async function loadStudio(supabase: SupabaseClient, userId: string): Promise<Studio> {
  const [p, w, c, t] = await Promise.all([
    supabase.from("arte_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("arte_works").select("*").eq("user_id", userId).order("sort"),
    supabase.from("arte_cv_items").select("*").eq("user_id", userId).order("year", { ascending: false }),
    supabase.from("arte_texts").select("*").eq("user_id", userId).is("application_id", null).order("version", { ascending: false }),
  ]);
  const rawTexts = (t.data as ArteText[]) || [];
  const texts: TextSet = {};
  for (const x of rawTexts) {
    if (x.kind === "letter") continue;
    texts[x.kind] = texts[x.kind] || {};
    if (!texts[x.kind]![x.lang]) texts[x.kind]![x.lang] = x.body; // latest version first
  }
  return { profile: (p.data as ArteProfile) ?? null, works: (w.data as ArteWork[]) || [], cv: (c.data as CvItem[]) || [], texts, rawTexts };
}

/** Short-lived URLs for private images (1 h). */
export async function signedUrls(supabase: SupabaseClient, paths: string[]): Promise<Record<string, string>> {
  const uniq = [...new Set(paths.filter(Boolean))];
  if (!uniq.length) return {};
  const { data } = await supabase.storage.from("arte-private").createSignedUrls(uniq, 3600);
  const out: Record<string, string> = {};
  for (const d of data || []) if (d.signedUrl && d.path) out[d.path] = d.signedUrl;
  return out;
}

export function slugify(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
