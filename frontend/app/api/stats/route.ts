import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import seedData from "@/lib/seed_data.json";

export const dynamic = "force-dynamic";

export async function GET() {
  if (supabase) {
    try {
      // the totals are exact counts: a plain select is capped at 1,000 rows, which made the landing say "1000+" for 6,600 actors
      const { data: nodes } = await supabase.from("nodes").select("cluster, verified").limit(2000);
      const { count: nodeCount } = await supabase.from("nodes").select("*", { count: "exact", head: true });
      const { count: verifiedTotal } = await supabase.from("nodes").select("*", { count: "exact", head: true }).eq("verified", true);
      const { count: edgeCount } = await supabase.from("edges").select("*", { count: "exact", head: true });

      if (nodes) {
        const clusterCounts: Record<string, number> = {};
        let verifiedCount = 0;
        for (const node of nodes) {
          clusterCounts[node.cluster] = (clusterCounts[node.cluster] || 0) + 1;
          if (node.verified) verifiedCount++;
        }

        return NextResponse.json({
          total_nodes: nodeCount ?? nodes.length,
          total_edges: edgeCount || 0,
          verified_nodes: verifiedTotal ?? verifiedCount,
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
