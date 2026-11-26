// Weekly mail "Lo nuevo para vos", called by the Vercel cron in vercel.json (Mondays, after the VPS pipeline's run).
// Vercel sends `Authorization: Bearer $CRON_SECRET`. Mails go through Resend's HTTP API when RESEND_API_KEY is set;
// without it, or with ?dry=1, it only counts what it would send. ?u=<user id> limits it to one artist (for a test).
import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/arte/supabase-server";
import { loadStudio } from "@/lib/arte/data";
import { buildMatchContext, loadPrograms } from "@/lib/arte/context";
import { rankPrograms } from "@/lib/arte/match";
import { todayAR } from "@/lib/arte/dates";
import { buildDigest, renderDigestEmail, unsubscribeToken } from "@/lib/arte/digest";

export const maxDuration = 60;

const FROM = process.env.ARTE_MAIL_FROM || "Arte · IndustriesVerified <arte@industriesverified.com>";
const BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://industriesverified.com").replace(/\/$/, "");

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const key = process.env.RESEND_API_KEY;
  const dry = !key || params.get("dry") === "1";
  const signing = process.env.SUPABASE_JWT_SECRET || secret;

  const admin = createAdminSupabase();
  let q = admin.from("arte_profiles").select("user_id, name, digest_sent_at").eq("digest_opt_out", false);
  if (params.get("u")) q = q.eq("user_id", params.get("u")!);
  const [{ data: profiles, error }, programs, { data: users }] = await Promise.all([
    q, loadPrograms(admin), admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const emails = new Map((users?.users || []).map((u) => [u.id, u.email]));

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 864e5).toISOString();
  const out = { artists: profiles?.length ?? 0, withNews: 0, sent: 0, failed: 0, dry };
  for (const p of profiles || []) {
    const to = emails.get(p.user_id);
    if (!to) continue;
    const studio = await loadStudio(admin, p.user_id);
    const ctx = await buildMatchContext(admin, p.user_id, studio, now);
    const d = buildDigest(rankPrograms(ctx, programs), p.digest_sent_at ?? weekAgo, todayAR(now));
    if (!d) continue;
    out.withNews++;
    if (dry) continue;
    const m = renderDigestEmail(d, {
      name: p.name || "", baseUrl: BASE,
      unsubscribeUrl: `${BASE}/arte/baja?u=${p.user_id}&t=${unsubscribeToken(p.user_id, signing)}`,
    });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject: m.subject, html: m.html, text: m.text }),
    });
    if (!res.ok) { out.failed++; console.error("[arte/resumen] Resend", res.status, await res.text()); continue; }
    out.sent++;
    await admin.from("arte_profiles").update({ digest_sent_at: now.toISOString() }).eq("user_id", p.user_id);
  }
  return NextResponse.json(out);
}
