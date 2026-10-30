import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/arte/supabase-server";

// Magic-link landing: exchange the code for a session, then onboarding (first time) or Hoy.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const origin = request.nextUrl.origin;
  if (!code) return NextResponse.redirect(`${origin}/arte/login`);
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return NextResponse.redirect(`${origin}/arte/login`);
  const { data: profile } = await supabase.from("arte_profiles").select("onboarded_at").eq("user_id", data.user.id).maybeSingle();
  return NextResponse.redirect(`${origin}${profile?.onboarded_at ? "/arte/hoy" : "/arte/onboarding"}`);
}
