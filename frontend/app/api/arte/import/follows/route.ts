import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/arte/supabase-server";
import { fetchIgFollowing } from "@/lib/arte/hiker";
import { followRows } from "@/lib/arte/import-map";

export const maxDuration = 120; // up to 20 sequential pages from the Instagram API

/** Stores who the artist follows on Instagram and which of those accounts are in the scene graph (seed for Descubrir and Invitar).
 *  Runs once per artist: it is skipped as soon as they have follows stored. */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "no autenticado" }, { status: 401 });
  const { pk } = (await request.json().catch(() => ({}))) as { pk?: string };
  if (!pk || !/^\d{1,20}$/.test(pk)) return NextResponse.json({ error: "falta el usuario" }, { status: 400 });
  const { count } = await supabase.from("arte_follows").select("handle", { count: "exact", head: true }).eq("user_id", auth.user.id);
  if (count) return NextResponse.json({ total: count, skipped: true });

  const follows = await fetchIgFollowing(pk);
  const handles = [...new Set(follows.map((f) => f.username.toLowerCase()))];
  const byHandle = new Map<string, string>();
  for (let i = 0; i < handles.length; i += 100) {   // short lists keep the query string well under URL limits
    const { data } = await supabase.from("nodes").select("id, contact_info").contains("industries", ["arte"]).in("contact_info->>instagram", handles.slice(i, i + 100));
    for (const m of data || []) byHandle.set(String((m.contact_info as Record<string, string>).instagram).toLowerCase(), m.id);
  }
  const rows = followRows(auth.user.id, follows, byHandle);
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from("arte_follows").upsert(rows.slice(i, i + 200));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ total: rows.length, inMap: rows.filter((r) => r.node_id).length });
}
