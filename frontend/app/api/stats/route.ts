import { NextResponse } from "next/server";
import seedData from "@/lib/seed_data.json";

export async function GET() {
  const nodes = seedData.nodes;
  const edges = seedData.edges;

  const clusterCounts: Record<string, number> = {};
  for (const node of nodes) {
    const cluster = node.cluster || "Unknown";
    clusterCounts[cluster] = (clusterCounts[cluster] || 0) + 1;
  }

  return NextResponse.json({
    total_nodes: nodes.length,
    total_edges: edges.length,
    verified_nodes: 0,
    cluster_counts: clusterCounts,
  });
}
