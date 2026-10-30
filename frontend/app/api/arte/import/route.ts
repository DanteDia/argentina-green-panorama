import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/arte/supabase-server";
import { fetchIgFollowing, fetchIgProfile } from "@/lib/arte/hiker";
import { importSite } from "@/lib/arte/site-import";
import { mapImport, type IgProfile } from "@/lib/arte/import-map";
import { findGraphNode } from "@/lib/arte/graph-match";

/** Onboarding import: Instagram + website + graph match -> a draft profile. Also stores who the artist follows. */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "no autenticado" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { website?: string; instagram?: string; name?: string };

  // Each import can cost ~20 paid Instagram API calls: one per artist every 10 minutes
  const { data: last } = await supabase.from("arte_imports").select("last_at").eq("user_id", auth.user.id).maybeSingle();
  if (last && Date.now() - Date.parse(last.last_at) < 10 * 60_000) {
    return NextResponse.json({ error: "Ya importamos tus datos hace unos minutos. Probá de nuevo en un rato o completá a mano." }, { status: 429 });
  }
  await supabase.from("arte_imports").upsert({ user_id: auth.user.id, last_at: new Date().toISOString() });

  const [ig, site] = await Promise.all([
    body.instagram ? fetchIgProfile(body.instagram) : Promise.resolve(undefined),
    body.website ? importSite(body.website) : Promise.resolve(undefined),
  ]);
  const igOk = ig && !("error" in ig) ? (ig as IgProfile) : null;
  const graphNode = await findGraphNode(supabase, igOk?.username ?? body.instagram?.replace(/^@/, "") ?? null, body.name || igOk?.full_name || null);
  const draft = mapImport({ ig, site, graphNode });

  const { count: yaSeguidos } = await supabase.from("arte_follows").select("handle", { count: "exact", head: true }).eq("user_id", auth.user.id);
  if (igOk?.pk && !yaSeguidos) {
    const follows = await fetchIgFollowing(String(igOk.pk));
    if (follows.length) {
      const handles = follows.map((f) => f.username.toLowerCase());
      const { data: matched } = await supabase.from("nodes").select("id, contact_info").contains("industries", ["arte"])
        .in("contact_info->>instagram", handles).limit(1000);
      const byHandle = new Map((matched || []).map((m) => [String((m.contact_info as Record<string, string>).instagram).toLowerCase(), m.id]));
      await supabase.from("arte_follows").upsert(follows.map((f) => ({ user_id: auth.user!.id, handle: f.username, full_name: f.full_name ?? null, node_id: byHandle.get(f.username.toLowerCase()) ?? null })));
      draft.sources.push(`${follows.length} cuentas que seguís (${byHandle.size} están en el mapa)`);
    }
  }
  return NextResponse.json(draft);
}
