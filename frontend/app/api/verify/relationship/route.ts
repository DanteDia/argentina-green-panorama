import { NextRequest, NextResponse } from "next/server";
import { verifyRelationship, DEFAULT_MAP_ID } from "@/lib/genlayer";

export async function POST(request: NextRequest) {
  try {
    const { edgeId, nodeAName, nodeALink, nodeBName, nodeBLink, relationshipType, relationshipDescription } =
      await request.json();

    if (!edgeId || !nodeAName || !nodeBName) {
      return NextResponse.json({ error: "edgeId, nodeAName, and nodeBName are required" }, { status: 400 });
    }

    const txHash = await verifyRelationship(
      DEFAULT_MAP_ID,
      edgeId,
      nodeAName,
      nodeALink || "",
      nodeBName,
      nodeBLink || "",
      relationshipType || "",
      relationshipDescription || "",
      "Green/Carbon/Environmental",
      "Argentina",
    );

    return NextResponse.json({ txHash, status: "submitted" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
