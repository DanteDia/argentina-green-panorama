import { NextRequest, NextResponse } from "next/server";
import { getTransactionStatus } from "@/lib/genlayer";

export async function GET(request: NextRequest) {
  try {
    const txHash = request.nextUrl.searchParams.get("txHash");

    if (!txHash) {
      return NextResponse.json({ error: "txHash is required" }, { status: 400 });
    }

    const result = await getTransactionStatus(txHash);

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message, status: "PENDING" }, { status: 200 });
  }
}
