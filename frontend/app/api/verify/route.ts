import { NextRequest, NextResponse } from "next/server";
import { verifyNode, DEFAULT_MAP_ID } from "@/lib/genlayer";

export async function POST(request: NextRequest) {
  try {
    const { nodeId, nombre, link, cluster, categoria, descripcion, country } = await request.json();

    if (!nodeId || !nombre) {
      return NextResponse.json({ error: "nodeId and nombre are required" }, { status: 400 });
    }

    const results = await verifyNode(
      DEFAULT_MAP_ID, nodeId, nombre, link || "",
      cluster || "", categoria || "", descripcion || "",
      country || "Argentina",
    );

    return NextResponse.json({ ...results, status: "submitted" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
