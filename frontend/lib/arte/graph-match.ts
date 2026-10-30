import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GraphNodeImport } from "./import-map";
import { escapeLike } from "./guards";

const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export async function findGraphNode(supabase: SupabaseClient, handle: string | null, name: string | null): Promise<GraphNodeImport | null> {
  let node = null as null | { id: string; nombre: string; descripcion: string | null; link: string | null; extra: Record<string, string>; contact_info: Record<string, string> };
  if (handle) {
    const { data } = await supabase.from("nodes").select("id, nombre, descripcion, link, extra, contact_info")
      .contains("industries", ["arte"]).ilike("contact_info->>instagram", escapeLike(handle.replace(/^@/, ""))).limit(1);
    node = data?.[0] ?? null;
  }
  if (!node && name && name.split(" ").length >= 2) {
    const { data } = await supabase.from("nodes").select("id, nombre, descripcion, link, extra, contact_info, categoria")
      .contains("industries", ["arte"]).eq("categoria", "artista").ilike("nombre", escapeLike(name.trim())).limit(3);
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

