// One-click unsubscribe from the mail client (List-Unsubscribe-Post, RFC 8058). Only POST acts: mail scanners
// open links with GET, and the page at /arte/baja asks for a button press for the same reason.
import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/arte/supabase-server";
import { validUnsubscribe } from "@/lib/arte/digest";

export async function POST(request: Request) {
  const sp = new URL(request.url).searchParams;
  const u = sp.get("u") || "", t = sp.get("t") || "", secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret || !validUnsubscribe(u, t, secret)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { error } = await createAdminSupabase().from("arte_profiles").update({ digest_opt_out: true }).eq("user_id", u);
  return error ? NextResponse.json({ error: "failed" }, { status: 500 }) : NextResponse.json({ ok: true });
}
