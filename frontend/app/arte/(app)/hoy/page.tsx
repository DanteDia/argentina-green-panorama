import Link from "next/link";
import { requireUser } from "@/lib/arte/supabase-server";
import { loadStudio } from "@/lib/arte/data";
import { buildMatchContext, loadPrograms } from "@/lib/arte/context";
import { rankPrograms, needsStatement } from "@/lib/arte/match";
import { completeness } from "@/lib/arte/completeness";
import { formatDay, todayAR } from "@/lib/arte/dates";
import { ProgramCard } from "@/components/arte/ProgramCard";
import { Meter } from "@/components/arte/ProfileTabs";
import type { ArteEvent } from "@/lib/arte/types";

const daysFrom = (n: number) => new Date(new Date().getTime() + n * 864e5).toISOString().slice(0, 10);

export default async function Hoy() {
  const { user, supabase } = await requireUser();
  const studio = await loadStudio(supabase, user.id);
  const [programs, ctx, apps, events] = await Promise.all([
    loadPrograms(supabase),
    buildMatchContext(supabase, user.id, studio),
    supabase.from("arte_applications").select("id, status, due_at, program_id, arte_programs(name)").eq("user_id", user.id).in("status", ["idea", "preparing"]).order("due_at"),
    supabase.from("arte_events").select("*").gte("starts_on", daysFrom(-21)).order("starts_on", { ascending: false }).limit(18),
  ]);
  const top = rankPrograms(ctx, programs).filter((r) => ["abierta", "próxima", "cierra hoy"].includes(r.state.label)).slice(0, 3);
  const c = completeness(ctx.profile, studio.works, studio.cv, studio.texts);
  const today = todayAR(new Date());
  const enSemana = (apps.data || []).filter((a) => a.due_at && a.due_at >= today && a.due_at <= daysFrom(8));
  const nombre = ctx.profile.name?.split(" ")[0];
  // a caption that is only a tag like "[REGISTROS/@cuenta]" says nothing: skip it
  const shown = ((events.data || []) as ArteEvent[]).filter((e) => !/^\[[^\]]*\]$/.test(e.title.trim())).slice(0, 6);

  return (
    <div className="max-w-5xl">
      <p className="eyebrow">Hoy · {formatDay(today)}</p>
      <h1 className="display mt-2 text-4xl md:text-5xl">Hola{nombre ? `, ${nombre}` : ""}.</h1>
      <p className="mt-2 text-[var(--ink-2)]">{enSemana.length ? `Tenés ${enSemana.length} cierre${enSemana.length > 1 ? "s" : ""} esta semana.` : "Esta semana no se te vence nada."} {top.length > 0 && "Estas son tus mejores oportunidades ahora."}</p>

      {needsStatement(ctx) && (
        <p className="card mt-6 p-4 text-sm">Todavía no sabemos de qué va tu obra, así que estas recomendaciones son generales. <Link href="/arte/perfil#textos" className="underline">Escribí tu statement</Link> (dos líneas alcanzan: las ordenamos por vos) y se afinan.</p>
      )}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0">
          <div className="flex items-baseline justify-between"><h2 className="display text-2xl">Para vos, ahora</h2><Link href="/arte/oportunidades" className="text-sm muted hover:text-[var(--ink)]">Ver todas →</Link></div>
          <div className="mt-3 space-y-3">{top.map((r) => <ProgramCard key={r.program.id} r={r} compact />)}</div>
        </section>
        <aside className={`space-y-4 ${c.score < 60 ? "order-first lg:order-none" : ""}`}>
          <Meter score={c.score} todo={c.todo} />
          <div className="card p-5">
            <p className="eyebrow">Tus cierres</p>
            {(apps.data || []).length === 0 ? <p className="mt-2 text-sm muted">Todavía no empezaste ninguna postulación.</p> : (
              <ul className="mt-2 space-y-2 text-sm">
                {(apps.data || []).slice(0, 5).map((a) => (
                  <li key={a.id}><Link href={`/arte/postulaciones/${a.id}`} className="flex justify-between gap-3 hover:underline">
                    <span className="truncate">{(a.arte_programs as unknown as { name: string } | null)?.name}</span>
                    <span className="shrink-0 muted">{a.due_at ? formatDay(a.due_at) : "—"}</span></Link></li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {shown.length > 0 && (
        <section className="mt-10">
          <h2 className="display text-2xl">Pasando en la escena</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {shown.map((e) => (
              <a key={e.id} href={e.url || "#"} target="_blank" rel="noreferrer" className="card block p-4 hover:shadow-sm">
                <p className="text-xs muted">{e.venue_name} · {e.starts_on ? formatDay(e.starts_on) : ""}</p>
                <p className="mt-1 line-clamp-3 text-sm">{e.title}</p>
                {e.artists.length > 0 && <p className="mt-2 text-xs text-[var(--ink-2)]">{e.artists.slice(0, 3).join(", ")}</p>}
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
