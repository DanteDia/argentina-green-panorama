import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const { nodeId, txHash } = await request.json();

    if (!nodeId || !txHash) {
      return NextResponse.json({ error: "nodeId and txHash required" }, { status: 400 });
    }

    if (!supabase) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    }

    const { error } = await supabase
      .from("nodes")
      .update({
        verified: true,
        verification_tx: txHash,
        verification_date: new Date().toISOString(),
      })
      .eq("id", nodeId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
