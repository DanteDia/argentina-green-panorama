import { NextResponse } from "next/server";
import seedData from "@/lib/seed_data.json";

export async function GET() {
  const nodes = seedData.nodes.map((node, i) => ({
    ...node,
    id: String(i + 1),
    verified: false,
    verification_tx: null,
    source: "manual",
  }));

  const nameToId: Record<string, string> = {};
  for (const n of nodes) {
    nameToId[n.nombre] = n.id;
  }

  const edges = seedData.edges
    .map((edge, i) => {
      const sourceId = nameToId[edge.source];
      const targetId = nameToId[edge.target];
      if (!sourceId || !targetId) return null;
      return {
        id: String(i + 1),
        source_id: sourceId,
        target_id: targetId,
        relationship_type: edge.type,
        description: edge.description || "",
        confidence: 1.0,
        source: "manual",
      };
    })
    .filter(Boolean);

  return NextResponse.json({ nodes, edges });
}
