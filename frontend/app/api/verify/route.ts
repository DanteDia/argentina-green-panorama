import { NextRequest, NextResponse } from "next/server";
import { verifyNode, DEFAULT_MAP_ID } from "@/lib/genlayer";

export async function POST(request: NextRequest) {
  try {
    const { nodeId, nombre, link, cluster, categoria, descripcion, quien_fondea } = await request.json();

    if (!nodeId || !nombre) {
      return NextResponse.json({ error: "nodeId and nombre are required" }, { status: 400 });
    }

    const txHash = await verifyNode(
      DEFAULT_MAP_ID, nodeId, nombre, link || "", cluster || "", categoria || "", descripcion || "", "Argentina", quien_fondea || ""
    );

    return NextResponse.json({ txHash, status: "submitted" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
