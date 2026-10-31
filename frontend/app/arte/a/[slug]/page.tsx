import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminSupabase } from "@/lib/arte/supabase-server";
import { CV_KINDS } from "@/lib/arte/cv";
import { ownPaths } from "@/lib/arte/guards";
import type { ArteProfile, ArteWork, CvItem } from "@/lib/arte/types";

// Public portfolio: read with the service role, but only rows the artist marked public.
async function load(slug: string) {
  const db = createAdminSupabase();
  const { data: p } = await db.from("arte_profiles").select("*").eq("slug", slug).eq("portfolio_public", true).maybeSingle();
  if (!p) return null;
  const profile = p as ArteProfile;
  const [w, c, t] = await Promise.all([
    db.from("arte_works").select("*").eq("user_id", profile.user_id).eq("public", true).order("sort"),
    db.from("arte_cv_items").select("*").eq("user_id", profile.user_id).eq("confirmed", true).order("year", { ascending: false }),
    db.from("arte_texts").select("kind, body").eq("user_id", profile.user_id).is("application_id", null).eq("lang", "es").in("kind", ["bio_long", "statement"]).order("version", { ascending: false }),
  ]);
  const works = (w.data || []) as ArteWork[];
  const paths = ownPaths(works.map((x) => x.images[0]).filter(Boolean), profile.user_id);
  const { data: signed } = paths.length ? await db.storage.from("arte-private").createSignedUrls(paths, 3600) : { data: [] };
  const url = new Map((signed || []).map((s) => [s.path, s.signedUrl]));
  const text = (k: string) => (t.data || []).find((x) => x.kind === k)?.body ?? "";
  return { profile, works: works.map((x) => ({ ...x, src: url.get(x.images[0]) ?? null })), cv: (c.data || []) as CvItem[], bio: text("bio_long"), statement: text("statement") };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = await load((await params).slug);
  return d ? { title: `${d.profile.name} · Portfolio`, description: d.statement.slice(0, 160) || `Obra de ${d.profile.name}` } : { title: "Portfolio" };
}

export default async function Portfolio({ params }: { params: Promise<{ slug: string }> }) {
  const d = await load((await params).slug);
  if (!d) notFound();
  const { profile: p } = d;
  const grupos = CV_KINDS.map(([k, l]) => [l, d.cv.filter((c) => c.kind === k)] as const).filter(([, xs]) => xs.length);
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <p className="eyebrow">Portfolio</p>
      <h1 className="display mt-2 text-5xl md:text-6xl">{p.name}</h1>
      <p className="mt-2 muted">{[p.base_city, p.mediums.join(", ")].filter(Boolean).join(" · ")}</p>
      <p className="mt-2 flex gap-4 text-sm">
        {p.website && <a href={p.website} className="underline" target="_blank" rel="noreferrer">Web</a>}
        {p.instagram && <a href={`https://instagram.com/${p.instagram}`} className="underline" target="_blank" rel="noreferrer">Instagram</a>}
        {p.email_public && <a href={`mailto:${p.email_public}`} className="underline">{p.email_public}</a>}
      </p>
      {d.statement && <p className="mt-10 max-w-3xl text-lg leading-relaxed text-[var(--ink-2)] whitespace-pre-line">{d.statement}</p>}
      {d.works.length > 0 && (
        <section className="mt-14 grid gap-8 md:grid-cols-2">
          {d.works.map((w) => (
            <figure key={w.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {w.src && <img src={w.src} alt={w.title} className="w-full rounded-lg bg-[var(--paper-2)] object-cover" loading="lazy" />}
              <figcaption className="mt-2 text-sm"><span className="display">{w.title}</span><span className="muted">{[w.year, w.technique, w.dimensions].filter(Boolean).map((x) => `, ${x}`).join("")}</span></figcaption>
            </figure>
          ))}
        </section>
      )}
      <div className="mt-16 grid gap-10 md:grid-cols-2">
        {d.bio && <section><h2 className="eyebrow">Biografía</h2><p className="mt-3 leading-relaxed text-[var(--ink-2)] whitespace-pre-line">{d.bio}</p></section>}
        {grupos.length > 0 && (
          <section><h2 className="eyebrow">CV</h2>
            {grupos.map(([l, xs]) => <div key={l} className="mt-4"><p className="text-sm font-medium">{l}</p>
              <ul className="mt-1 space-y-0.5 text-sm text-[var(--ink-2)]">{xs.map((c) => <li key={c.id}><span className="muted tabular-nums">{c.year ?? "—"}</span> {c.title}{c.org && c.org !== c.title ? `, ${c.org}` : ""}</li>)}</ul></div>)}
          </section>
        )}
      </div>
      <p className="mt-20 text-xs muted">Portfolio en IndustriesVerified · Arte</p>
    </main>
  );
}
