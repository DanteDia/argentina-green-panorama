import { NextRequest, NextResponse } from "next/server";
import { verifyNode } from "@/lib/genlayer";

export async function POST(request: NextRequest) {
  try {
    const { nodeId, nombre, link, cluster, categoria, descripcion } = await request.json();

    if (!nodeId || !nombre) {
      return NextResponse.json({ error: "nodeId and nombre are required" }, { status: 400 });
    }

    const txHash = await verifyNode(nodeId, nombre, link || "", cluster || "", categoria || "", descripcion || "");

    return NextResponse.json({ txHash, status: "submitted" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
