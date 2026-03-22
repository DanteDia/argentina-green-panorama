import { NextRequest, NextResponse } from "next/server";
import { getVerification, getSocialVerification, getRelationshipVerification, DEFAULT_MAP_ID } from "@/lib/genlayer";

export async function GET(request: NextRequest) {
  try {
    const nodeId = request.nextUrl.searchParams.get("nodeId");
    const type = request.nextUrl.searchParams.get("type") || "node"; // "node" | "social"

    if (!nodeId) {
      return NextResponse.json({ error: "nodeId is required" }, { status: 400 });
    }

    const mapId = request.nextUrl.searchParams.get("mapId") || DEFAULT_MAP_ID;
    const result = type === "relationship"
      ? await getRelationshipVerification(mapId, nodeId)
      : type === "social"
      ? await getSocialVerification(mapId, nodeId)
      : await getVerification(mapId, nodeId);

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
