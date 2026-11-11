import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/arte/supabase-server";
import { fetchIgFollowing, fetchIgProfile } from "@/lib/arte/hiker";
import { followRows } from "@/lib/arte/import-map";

export const maxDuration = 120; // up to 20 sequential pages from the Instagram API

/** Stores who the artist follows on Instagram and which of those accounts are in the scene graph (seed for Descubrir and Invitar).
 *  Skipped as soon as the artist has follows stored; otherwise metered by claim_arte_follows. */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "no autenticado" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { pk?: string };
  const { count } = await supabase.from("arte_follows").select("handle", { count: "exact", head: true }).eq("user_id", auth.user.id);
  if (count) return NextResponse.json({ total: count, skipped: true });
  // Paid and slow: one attempt per artist every 10 minutes, claimed atomically before any API call
  const { data: granted } = await supabase.rpc("claim_arte_follows");
  if (!granted) return NextResponse.json({ error: "Ya lo intentamos hace unos minutos. Probá de nuevo en un rato." }, { status: 429 });

  // The onboarding page sends the id it just read; from Descubrir we look it up from the profile's handle
  let pk = body.pk && /^\d{1,20}$/.test(body.pk) ? body.pk : null;
  if (!pk) {
    const { data: profile } = await supabase.from("arte_profiles").select("instagram").eq("user_id", auth.user.id).maybeSingle();
    const ig = profile?.instagram ? await fetchIgProfile(profile.instagram) : null;
    pk = ig && !("error" in ig) && ig.pk ? String(ig.pk) : null;
  }
  if (!pk) return NextResponse.json({ error: "Cargá tu Instagram en el perfil primero." }, { status: 400 });

  const follows = await fetchIgFollowing(pk);
  const handles = [...new Set(follows.map((f) => f.username.toLowerCase()))];
  const byHandle = new Map<string, string>();
  for (let i = 0; i < handles.length; i += 100) {   // short lists keep the query string well under URL limits
    const { data, error } = await supabase.from("nodes").select("id, contact_info").contains("industries", ["arte"]).in("contact_info->>instagram", handles.slice(i, i + 100));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });   // storing unmatched rows would hide them from Descubrir for good
    for (const m of data || []) byHandle.set(String((m.contact_info as Record<string, string>).instagram).toLowerCase(), m.id);
  }
  const rows = followRows(auth.user.id, follows, byHandle);
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from("arte_follows").upsert(rows.slice(i, i + 200));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ total: rows.length, inMap: rows.filter((r) => r.node_id).length });
}
