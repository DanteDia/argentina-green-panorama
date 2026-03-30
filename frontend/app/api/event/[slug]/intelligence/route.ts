import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const nodeId = request.nextUrl.searchParams.get("nodeId");

  if (!nodeId || !supabase) {
    return NextResponse.json({ signals: [] });
  }

  try {
    const { data, error } = await supabase
      .from("node_intelligence")
      .select("*")
      .eq("node_id", nodeId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ signals: [] });
    }

    return NextResponse.json({
      signals: (data || []).map((s) => ({
        id: s.id,
        type: s.intel_type,
        source: s.source,
        title: s.title,
        content: s.content,
        url: s.url,
        author: s.author,
        engagementScore: s.engagement_score,
        detectedAt: s.detected_at,
      })),
    });
  } catch {
    return NextResponse.json({ signals: [] });
  }
}
