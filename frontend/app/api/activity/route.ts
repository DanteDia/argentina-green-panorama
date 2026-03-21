import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

interface ActivityEntry {
  type: "node_added" | "verified" | "verification_failed" | "grey" | "edge_added";
  name: string;
  cluster?: string;
  source?: string;
  time: string;
  from?: string;
  to?: string;
  rel?: string;
}

export async function GET() {
  if (!supabase) {
    return NextResponse.json([]);
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // last 7 days
  const entries: ActivityEntry[] = [];

  try {
    // 1. New nodes added recently
    const { data: newNodes } = await supabase
      .from("nodes")
      .select("nombre, cluster, source, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(15);

    if (newNodes) {
      for (const n of newNodes) {
        entries.push({
          type: "node_added",
          name: n.nombre,
          cluster: n.cluster,
          source: n.source,
          time: n.created_at,
        });
      }
    }

    // 2. Recently verified nodes
    const { data: verifiedNodes } = await supabase
      .from("nodes")
      .select("nombre, cluster, verification_date, verification_status")
      .eq("verified", true)
      .not("verification_date", "is", null)
      .gte("verification_date", since)
      .order("verification_date", { ascending: false })
      .limit(10);

    if (verifiedNodes) {
      for (const n of verifiedNodes) {
        entries.push({
          type: "verified",
          name: n.nombre,
          cluster: n.cluster,
          time: n.verification_date,
        });
      }
    }

    // 3. Recently failed/grey nodes
    const { data: failedNodes } = await supabase
      .from("nodes")
      .select("nombre, cluster, verification_status, updated_at")
      .in("verification_status", ["failed", "grey"])
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(5);

    if (failedNodes) {
      for (const n of failedNodes) {
        entries.push({
          type: n.verification_status === "grey" ? "grey" : "verification_failed",
          name: n.nombre,
          cluster: n.cluster,
          time: n.updated_at,
        });
      }
    }

    // 4. New edges added recently
    const { data: newEdges } = await supabase
      .from("edges")
      .select("source_id, target_id, relationship_type, source, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(10);

    if (newEdges && newEdges.length > 0) {
      // Resolve node IDs to names
      const nodeIds = new Set<string>();
      for (const e of newEdges) {
        nodeIds.add(e.source_id);
        nodeIds.add(e.target_id);
      }
      const { data: nodeNames } = await supabase
        .from("nodes")
        .select("id, nombre")
        .in("id", Array.from(nodeIds));

      const idToName: Record<string, string> = {};
      if (nodeNames) {
        for (const n of nodeNames) idToName[n.id] = n.nombre;
      }

      for (const e of newEdges) {
        entries.push({
          type: "edge_added",
          name: `${idToName[e.source_id] || "?"} - ${idToName[e.target_id] || "?"}`,
          from: idToName[e.source_id],
          to: idToName[e.target_id],
          rel: e.relationship_type,
          source: e.source,
          time: e.created_at,
        });
      }
    }
  } catch {
    // Return whatever we have
  }

  // Sort all entries by time descending and limit to 20
  entries.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  return NextResponse.json(entries.slice(0, 20));
}
