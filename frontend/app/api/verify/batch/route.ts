import { NextRequest, NextResponse } from "next/server";
import { verifyNode, DEFAULT_MAP_ID } from "@/lib/genlayer";
import seedData from "@/lib/seed_data.json";

export async function POST(request: NextRequest) {
  try {
    const { count = 3 } = await request.json();
    const limit = Math.min(count, 10);

    const results: { nodeId: string; nombre: string; txHash?: string; error?: string }[] = [];

    for (let i = 0; i < Math.min(limit, seedData.nodes.length); i++) {
      const node = seedData.nodes[i];
      const nodeId = String(i + 1);

      try {
        const txHash = await verifyNode(
          DEFAULT_MAP_ID,
          nodeId,
          node.nombre,
          node.link || "",
          node.cluster,
          node.categoria || "",
          node.descripcion || "",
          "Argentina",
        );
        results.push({ nodeId, nombre: node.nombre, txHash });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        results.push({ nodeId, nombre: node.nombre, error: message });
      }
    }

    return NextResponse.json({ results, submitted: results.filter(r => r.txHash).length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
