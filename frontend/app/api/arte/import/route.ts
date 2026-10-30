import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/arte/supabase-server";
import { fetchIgFollowing, fetchIgProfile } from "@/lib/arte/hiker";
import { importSite } from "@/lib/arte/site-import";
import { mapImport, type GraphNodeImport, type IgProfile } from "@/lib/arte/import-map";
import type { SupabaseClient } from "@supabase/supabase-js";

const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

async function findGraphNode(supabase: SupabaseClient, handle: string | null, name: string | null): Promise<GraphNodeImport | null> {
  let node = null as null | { id: string; nombre: string; descripcion: string | null; link: string | null; extra: Record<string, string>; contact_info: Record<string, string> };
  if (handle) {
    const { data } = await supabase.from("nodes").select("id, nombre, descripcion, link, extra, contact_info")
      .contains("industries", ["arte"]).ilike("contact_info->>instagram", handle).limit(1);
    node = data?.[0] ?? null;
  }
  if (!node && name && name.split(" ").length >= 2) {
    const { data } = await supabase.from("nodes").select("id, nombre, descripcion, link, extra, contact_info, categoria")
      .contains("industries", ["arte"]).eq("categoria", "artista").ilike("nombre", name.trim()).limit(3);
    node = data?.find((n) => norm(n.nombre) === norm(name)) ?? null;
  }
  if (!node) return null;
  const { data: edges } = await supabase.from("edges").select("relationship_type, fecha, target:nodes!edges_target_id_fkey(nombre, categoria)")
    .eq("source_id", node.id).limit(300);
  return {
    id: node.id, nombre: node.nombre, descripcion: node.descripcion, link: node.link,
    extra: node.extra || {}, contact_info: node.contact_info || {},
    edges: (edges || []).map((e) => {
      const t = e.target as unknown as { nombre: string; categoria: string } | null;
      return { relationship_type: e.relationship_type, fecha: e.fecha, target_nombre: t?.nombre || "", target_tipo: t?.categoria || "" };
    }).filter((e) => e.target_nombre),
  };
}

/** Onboarding import: Instagram + website + graph match -> a draft profile. Also stores who the artist follows. */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "no autenticado" }, { status: 401 });
  const body = (await request.json()) as { website?: string; instagram?: string; name?: string };

  const [ig, site] = await Promise.all([
    body.instagram ? fetchIgProfile(body.instagram) : Promise.resolve(undefined),
    body.website ? importSite(body.website) : Promise.resolve(undefined),
  ]);
  const igOk = ig && !("error" in ig) ? (ig as IgProfile) : null;
  const graphNode = await findGraphNode(supabase, igOk?.username ?? body.instagram?.replace(/^@/, "") ?? null, body.name || igOk?.full_name || null);
  const draft = mapImport({ ig, site, graphNode });

  if (igOk?.pk) {
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
