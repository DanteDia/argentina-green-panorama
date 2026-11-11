import Link from "next/link";
import { requireUser } from "@/lib/arte/supabase-server";
import { loadStudio } from "@/lib/arte/data";
import { buildMatchContext, loadPrograms } from "@/lib/arte/context";
import { needsStatement, rankPrograms } from "@/lib/arte/match";
import { ProgramCard } from "@/components/arte/ProgramCard";

const ESTADOS = [["", "Todas"], ["abierta", "Abiertas"], ["próxima", "Próximas"], ["recurrente", "Para agendar"]] as const;
const TIPOS = ["Beca", "Residencia", "Premio", "Convocatoria", "Formación"];

export default async function Oportunidades({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { user, supabase } = await requireUser();
  const studio = await loadStudio(supabase, user.id);
  const [programs, ctx] = await Promise.all([loadPrograms(supabase), buildMatchContext(supabase, user.id, studio)]);
  let ranked = rankPrograms(ctx, programs);
  // what is actually open, said first: "208 oportunidades" hides that most are to plan ahead
  const n = (labels: string[]) => ranked.filter((r) => labels.includes(r.state.label)).length;
  const resumen = [[n(["abierta", "cierra hoy"]), "abiertas ahora"], [n(["próxima"]), "por abrir"], [n(["recurrente"]), "para agendar"]]
    .filter(([c]) => c).map(([c, l]) => `${c} ${l}`).join(" · ") || "Nada por ahora";
  if (sp.estado) ranked = ranked.filter((r) => (sp.estado === "abierta" ? ["abierta", "cierra hoy"].includes(r.state.label) : r.state.label === sp.estado));
  if (sp.tipo) ranked = ranked.filter((r) => (r.program.type || "").toLowerCase().startsWith(sp.tipo!.toLowerCase().slice(0, 5)));
  if (sp.digital) ranked = ranked.filter((r) => r.program.digital_focus);
  if (sp.q) { const q = sp.q.toLowerCase(); ranked = ranked.filter((r) => `${r.program.name} ${r.program.organizer} ${r.program.description}`.toLowerCase().includes(q)); }
  const href = (k: string, v: string) => { const n = new URLSearchParams(sp as Record<string, string>); if (v) n.set(k, v); else n.delete(k); return `?${n}`; };

  return (
    <div className="max-w-5xl">
      <p className="eyebrow">Oportunidades</p>
      <h1 className="display mt-2 text-4xl">A qué te conviene postularte</h1>
      <p className="mt-2 muted">{resumen}. Ordenadas por afinidad con tu perfil; solo ves aquellas a las que podés aplicar.</p>
      {needsStatement(ctx) && (
        <p className="card mt-6 p-4 text-sm">Todavía no sabemos de qué va tu obra, así que estas recomendaciones son generales. <Link href="/arte/perfil#textos" className="underline">Escribí tu statement</Link> (dos líneas alcanzan: las ordenamos por vos) y se afinan.</p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {ESTADOS.map(([v, l]) => <Link key={v} href={href("estado", v)} className={`pill ${(sp.estado || "") === v ? "bg-[var(--ink)] text-[var(--paper)] border-transparent" : ""}`}>{l}</Link>)}
        <span className="mx-1 h-4 w-px bg-[var(--line)]" />
        {TIPOS.map((t) => <Link key={t} href={href("tipo", sp.tipo === t ? "" : t)} className={`pill ${sp.tipo === t ? "bg-[var(--ink)] text-[var(--paper)] border-transparent" : ""}`}>{t}</Link>)}
        <Link href={href("digital", sp.digital ? "" : "1")} className={`pill ${sp.digital ? "bg-[var(--ink)] text-[var(--paper)] border-transparent" : ""}`}>Arte y tecnología</Link>
        <form className="ml-auto"><input name="q" defaultValue={sp.q} placeholder="Buscar…" className="input !w-48 !py-1.5" aria-label="Buscar" /></form>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {ranked.slice(0, 80).map((r) => <ProgramCard key={r.program.id} r={r} />)}
      </div>
      {!ranked.length && <p className="card mt-6 p-6 muted">No hay oportunidades con esos filtros.</p>}
    </div>
  );
}
