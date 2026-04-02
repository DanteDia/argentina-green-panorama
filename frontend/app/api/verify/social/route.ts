import { NextRequest, NextResponse } from "next/server";
import { verifySocial, DEFAULT_MAP_ID } from "@/lib/genlayer";

export async function POST(request: NextRequest) {
  try {
    const { nodeId, nombre, platform, socialUrl, claimedFollowers } = await request.json();

    if (!nodeId || !nombre || !platform || !socialUrl) {
      return NextResponse.json({ error: "nodeId, nombre, platform, and socialUrl are required" }, { status: 400 });
    }

    const txHash = await verifySocial(
      DEFAULT_MAP_ID,
      nodeId,
      nombre,
      platform,
      socialUrl,
      String(claimedFollowers || "0"),
    );

    return NextResponse.json({ txHash, status: "submitted" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
