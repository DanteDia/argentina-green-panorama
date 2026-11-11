import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/arte/supabase-server";
import { fetchIgPosts, fetchIgProfile } from "@/lib/arte/hiker";
import { importSite } from "@/lib/arte/site-import";
import { mapImport, type IgProfile } from "@/lib/arte/import-map";
import { findGraphNode } from "@/lib/arte/graph-match";

/** Onboarding import: Instagram (profile + recent posts) + website + graph match -> a draft profile. */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "no autenticado" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { website?: string; instagram?: string; name?: string };

  // Instagram costs money (2 paid API calls per import; reading follows is metered apart): one per artist every 10 minutes, claimed atomically
  if (body.instagram) {
    const { data: granted } = await supabase.rpc("claim_arte_import");
    if (!granted) return NextResponse.json({ error: "Ya leímos tu Instagram hace unos minutos. Probá de nuevo en un rato o completá a mano." }, { status: 429 });
  }

  const igP = body.instagram ? fetchIgProfile(body.instagram) : Promise.resolve(undefined);
  const [ig, site, posts] = await Promise.all([
    igP,
    body.website ? importSite(body.website) : Promise.resolve(undefined),
    igP.then((p) => (p && !("error" in p) && p.pk ? fetchIgPosts(String(p.pk)) : [])),
  ]);
  const igOk = ig && !("error" in ig) ? (ig as IgProfile) : null;
  const graphNode = await findGraphNode(supabase, igOk?.username ?? body.instagram?.replace(/^@/, "") ?? null, body.name || igOk?.full_name || null);
  // Who the artist follows takes ~40 s to read: the page asks for it in the background (import/follows) while they review the draft
  return NextResponse.json(mapImport({ ig, site, graphNode, posts }));
}
