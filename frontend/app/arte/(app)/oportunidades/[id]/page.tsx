import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/arte/supabase-server";
import { loadStudio } from "@/lib/arte/data";
import { buildMatchContext } from "@/lib/arte/context";
import { scoreProgram } from "@/lib/arte/match";
import { checkEligibility } from "@/lib/arte/eligibility";
import { programState } from "@/lib/arte/dates";
import { createApplication } from "../../postulaciones/actions";
import type { Program, Requirements } from "@/lib/arte/types";

const REQ: [keyof Requirements, (v: never) => string][] = [
  ["letter", () => "Carta de motivación"], ["cv", () => "CV"], ["bio", () => "Biografía"], ["statement", () => "Statement"],
  ["portfolio", () => "Portfolio / dossier"], ["images_n", (n: number) => `${n} imágenes de obra`], ["pdf_pages_max", (n: number) => `PDF de hasta ${n} páginas`],
  ["pdf_mb_max", (n: number) => `Archivo de hasta ${n} MB`], ["project", () => "Proyecto"], ["budget", () => "Presupuesto"], ["video", () => "Video"],
];

export default async function Oportunidad({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, supabase } = await requireUser();
  const { data } = await supabase.from("arte_programs").select("*").eq("id", decodeURIComponent(id)).maybeSingle();
  if (!data) notFound();
  const p = data as Program;
  const studio = await loadStudio(supabase, user.id);
  const ctx = await buildMatchContext(supabase, user.id, studio);
  const s = scoreProgram(ctx, p);
  const el = checkEligibility(ctx.profile, p, ctx.now);
  const st = programState(p, ctx.now);
  const ya = ctx.appliedProgramIds.has(p.id);
  const reqs = REQ.filter(([k]) => p.requirements?.[k]);

  return (
    <div className="max-w-3xl">
      <Link href="/arte/oportunidades" className="eyebrow">← Oportunidades</Link>
      <h1 className="display mt-3 text-4xl leading-tight">{p.name}</h1>
      <p className="mt-1 muted">{[p.organizer, p.type, p.country].filter(Boolean).join(" · ")}</p>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div className="card p-4"><p className="eyebrow">Estado</p><p className="mt-1 font-medium">{st.text}</p></div>
        <div className="card p-4"><p className="eyebrow">Afinidad</p><p className="display mt-1 text-3xl">{s.score}</p></div>
        <div className="card p-4"><p className="eyebrow">Preparación</p><p className="mt-1 font-medium">~{s.effortDays} días</p></div>
      </div>

      <section className="card mt-4 p-5">
        <h2 className="display text-xl">Por qué te la recomendamos</h2>
        <ul className="mt-2 space-y-1 text-sm">{s.reasons.map((r) => <li key={r}>→ {r}</li>)}</ul>
        {!el.ok && <p className="mt-3 text-sm text-[var(--accent)]">No sos elegible: {el.reasons.join(" · ")}</p>}
        {el.ok && el.reasons.length > 0 && <p className="mt-3 text-sm text-[var(--warn)]">{el.reasons.join(" · ")}</p>}
      </section>

      {p.description && <section className="mt-4"><h2 className="eyebrow">De qué se trata</h2><p className="mt-2 leading-relaxed text-[var(--ink-2)] whitespace-pre-line">{p.description}</p></section>}
      {p.benefit && <section className="mt-4"><h2 className="eyebrow">Qué ofrece</h2><p className="mt-2 text-[var(--ink-2)]">{p.benefit}</p></section>}

      <section className="mt-4">
        <h2 className="eyebrow">Qué piden</h2>
        {reqs.length ? (
          <ul className="mt-2 space-y-2">
            {reqs.map(([k, f]) => (
              <li key={k} className="card p-3 text-sm">
                <span className="font-medium">{f(p.requirements[k] as never)}</span>
                {p.evidence?.[k] && <span className="mt-1 block text-xs muted">“{p.evidence[k]}”</span>}
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-sm muted">Requisitos a confirmar en las bases oficiales.</p>}
      </section>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        {ya ? <Link href="/arte/postulaciones" className="btn btn-ghost">Ya estás postulando · ver</Link> : (
          <form action={createApplication.bind(null, p.id)}><button className="btn btn-primary" disabled={!el.ok}>Postularme</button></form>
        )}
        {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="btn btn-ghost">Bases oficiales ↗</a>}
      </div>
      <p className="mt-6 text-xs muted">Fuente: {(p.source || "—").replace(/\s*\(https?:[^)]*\)/, "")}{p.verified_at ? ` · verificado el ${p.verified_at}` : ""}. Confirmá siempre fechas y requisitos en las bases oficiales.</p>
    </div>
  );
}
