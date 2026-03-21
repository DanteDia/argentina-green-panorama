import { NextRequest, NextResponse } from "next/server";
import { verifyRelationship } from "@/lib/genlayer";

export async function POST(request: NextRequest) {
  try {
    const { edgeId, nodeAName, nodeALink, nodeBName, nodeBLink, relationshipType, relationshipDescription } =
      await request.json();

    if (!edgeId || !nodeAName || !nodeBName) {
      return NextResponse.json({ error: "edgeId, nodeAName, and nodeBName are required" }, { status: 400 });
    }

    const txHash = await verifyRelationship(
      edgeId,
      nodeAName,
      nodeALink || "",
      nodeBName,
      nodeBLink || "",
      relationshipType || "",
      relationshipDescription || "",
    );

    return NextResponse.json({ txHash, status: "submitted" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
