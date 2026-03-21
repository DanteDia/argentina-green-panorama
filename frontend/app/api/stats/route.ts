import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import seedData from "@/lib/seed_data.json";

export const dynamic = "force-dynamic";

export async function GET() {
  if (supabase) {
    try {
      const { data: nodes } = await supabase.from("nodes").select("cluster, verified").limit(2000);
      const { count: edgeCount } = await supabase.from("edges").select("*", { count: "exact", head: true });

      if (nodes) {
        const clusterCounts: Record<string, number> = {};
        let verifiedCount = 0;
        for (const node of nodes) {
          clusterCounts[node.cluster] = (clusterCounts[node.cluster] || 0) + 1;
          if (node.verified) verifiedCount++;
        }

        return NextResponse.json({
          total_nodes: nodes.length,
          total_edges: edgeCount || 0,
          verified_nodes: verifiedCount,
          cluster_counts: clusterCounts,
        });
      }
    } catch {
      // Fall through
    }
  }

  // Fallback
  const clusterCounts: Record<string, number> = {};
  for (const node of seedData.nodes) {
    const cluster = node.cluster || "Unknown";
    clusterCounts[cluster] = (clusterCounts[cluster] || 0) + 1;
  }

  return NextResponse.json({
    total_nodes: seedData.nodes.length,
    total_edges: seedData.edges.length,
    verified_nodes: 0,
    cluster_counts: clusterCounts,
  });
}
