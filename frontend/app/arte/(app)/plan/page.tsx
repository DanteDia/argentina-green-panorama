import Link from "next/link";
import { requireUser } from "@/lib/arte/supabase-server";
import { loadStudio } from "@/lib/arte/data";
import { buildMatchContext, loadPrograms } from "@/lib/arte/context";
import { rankPrograms } from "@/lib/arte/match";
import { seasonPlan } from "@/lib/arte/plan";
import { formatDay } from "@/lib/arte/dates";

const mesNombre = (m: string) => new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(m + "-01T00:00:00Z"));

export default async function Plan() {
  const { user, supabase } = await requireUser();
  const studio = await loadStudio(supabase, user.id);
  const [programs, ctx] = await Promise.all([loadPrograms(supabase), buildMatchContext(supabase, user.id, studio)]);
  const budget = ctx.profile.monthly_budget || 2;
  const plan = seasonPlan(rankPrograms(ctx, programs).filter((r) => r.score >= 55), budget, ctx.now);
  return (
    <div className="max-w-4xl">
      <p className="eyebrow">Plan</p>
      <h1 className="display mt-2 text-4xl">Tu temporada</h1>
      <p className="mt-2 muted">Las mejores oportunidades de los próximos 12 meses, con {budget} postulaciones por mes como máximo (lo cambiás en tu perfil). Las fechas <span className="pill">proyectadas</span> salen de ediciones anteriores: confirmalas cuando abran.</p>
      <ol className="mt-8 space-y-8">
        {plan.map((m) => (
          <li key={m.month}>
            <h2 className="display text-2xl capitalize">{mesNombre(m.month)}</h2>
            <ul className="mt-3 space-y-2">
              {m.items.map((i) => (
                <li key={i.programId}>
                  <Link href={`/arte/oportunidades/${encodeURIComponent(i.programId)}`} className="card flex items-center justify-between gap-4 p-4 hover:shadow-sm">
                    <span className="min-w-0"><span className="display block truncate text-lg">{i.name}</span>
                      <span className="text-xs muted">Empezar el {formatDay(i.prepStart)} · cierra el {formatDay(i.deadline)}</span></span>
                    <span className="flex shrink-0 items-center gap-2">{i.projected && <span className="pill">proyectada</span>}<span className="display text-2xl">{i.score}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {!plan.length && <p className="card mt-6 p-6 muted">Completá tu perfil para que podamos armarte un plan.</p>}
    </div>
  );
}
