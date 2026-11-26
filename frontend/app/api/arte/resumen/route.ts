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
const BUDGET_MS = 50_000;   // stop sending before the function is killed; the rest go first next week
const POOL = 5;

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
  const signing = process.env.SUPABASE_JWT_SECRET;
  if (!signing) return NextResponse.json({ error: "SUPABASE_JWT_SECRET missing: unsubscribe links cannot be signed" }, { status: 500 });
  const started = Date.now();

  const admin = createAdminSupabase();
  // the longest without a mail first, so a run cut short never skips the same artists twice
  let q = admin.from("arte_profiles").select("user_id, name, digest_sent_at").eq("digest_opt_out", false)
    .order("digest_sent_at", { ascending: true, nullsFirst: true });
  if (params.get("u")) q = q.eq("user_id", params.get("u")!);
  const [{ data: profiles, error }, programs] = await Promise.all([q, loadPrograms(admin)]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const emails = new Map<string, string | undefined>();
  for (let page = 1; ; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    for (const u of data?.users || []) emails.set(u.id, u.email);
    if ((data?.users.length ?? 0) < 1000) break;
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 864e5).toISOString();
  const out = { artists: profiles?.length ?? 0, withNews: 0, sent: 0, failed: 0, left: 0, dry };
  const one = async (p: { user_id: string; name: string | null; digest_sent_at: string | null }) => {
    const to = emails.get(p.user_id);
    if (!to) return;
    const studio = await loadStudio(admin, p.user_id);
    const ctx = await buildMatchContext(admin, p.user_id, studio, now);
    const d = buildDigest(rankPrograms(ctx, programs), p.digest_sent_at ?? weekAgo, todayAR(now));
    if (!d) return;
    out.withNews++;
    if (dry) return;
    const sig = `u=${p.user_id}&t=${unsubscribeToken(p.user_id, signing)}`;
    const m = renderDigestEmail(d, { name: p.name || "", baseUrl: BASE, unsubscribeUrl: `${BASE}/arte/baja?${sig}` });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM, to, subject: m.subject, html: m.html, text: m.text,
        // one-click unsubscribe in the mail client (RFC 8058): a POST, which mail scanners do not send
        headers: { "List-Unsubscribe": `<${BASE}/api/arte/baja?${sig}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      }),
    });
    if (!res.ok) { out.failed++; console.error("[arte/resumen] Resend", res.status, await res.text()); return; }
    out.sent++;
    const { error: upd } = await admin.from("arte_profiles").update({ digest_sent_at: now.toISOString() }).eq("user_id", p.user_id);
    if (upd) console.error("[arte/resumen] digest_sent_at", p.user_id, upd.message);
  };
  const list = profiles || [];
  for (let i = 0; i < list.length; i += POOL) {
    if (Date.now() - started > BUDGET_MS) { out.left = list.length - i; console.warn("[arte/resumen] out of time,", out.left, "left for next run"); break; }
    await Promise.all(list.slice(i, i + POOL).map(one));
  }
  return NextResponse.json(out);
}
