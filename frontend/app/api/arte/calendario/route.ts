import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/arte/supabase-server";
import { todayAR } from "@/lib/arte/dates";
import { toIcs } from "@/lib/arte/ics";

/** The artist's upcoming closings as a calendar file, with reminders a week and two days before each one. */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "no autenticado" }, { status: 401 });
  const now = new Date();
  const { data, error } = await supabase.from("arte_applications").select("id, due_at, arte_programs(name, url)")
    .eq("user_id", auth.user.id).in("status", ["idea", "preparing"]).gte("due_at", todayAR(now)).order("due_at");
  if (error) return NextResponse.json({ error: "No pudimos leer tus postulaciones. Probá de nuevo." }, { status: 500 });   // never an empty calendar that looks fine
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const events = ((data || []) as unknown as { id: string; due_at: string; arte_programs: { name: string; url: string | null } | null }[]).map((a) => ({
    uid: a.id, date: a.due_at, title: `Cierra: ${a.arte_programs?.name ?? "convocatoria"}`,
    description: `Tu postulación: ${origin}/arte/postulaciones/${a.id}${a.arte_programs?.url ? `\nBases: ${a.arte_programs.url}` : ""}`,
    url: `${origin}/arte/postulaciones/${a.id}`,
  }));
  const ics = toIcs(events, now);
  if (!ics) return NextResponse.json({ error: "No tenés cierres con fecha por ahora." }, { status: 404 });
  return new NextResponse(ics, {
    headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": 'attachment; filename="cierres-arte.ics"', "cache-control": "no-store" },
  });
}
