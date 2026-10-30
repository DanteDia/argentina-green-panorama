import Link from "next/link";
import { requireUser } from "@/lib/arte/supabase-server";
import { formatDay, todayAR } from "@/lib/arte/dates";
import type { AppStatus } from "@/lib/arte/types";

const COLS: [AppStatus[], string][] = [[["idea", "preparing"], "Preparando"], [["sent"], "Enviadas"], [["selected"], "Seleccionado"], [["rejected", "withdrawn"], "No esta vez"]];

export default async function Postulaciones() {
  const { user, supabase } = await requireUser();
  const { data } = await supabase.from("arte_applications")
    .select("id, status, due_at, arte_programs(name, organizer), arte_application_items(done)").eq("user_id", user.id).order("due_at");
  const apps = (data || []) as unknown as { id: string; status: AppStatus; due_at: string | null; arte_programs: { name: string; organizer: string | null }; arte_application_items: { done: boolean }[] }[];
  const today = todayAR(new Date());
  return (
    <div>
      <p className="eyebrow">Postulaciones</p>
      <h1 className="display mt-2 text-4xl">Tu seguimiento</h1>
      <p className="mt-2 muted">{apps.length ? `${apps.length} postulaciones. Todo lo que falta, en un solo lugar.` : "Todavía no empezaste ninguna. Elegí una en Oportunidades."}</p>
      {!apps.length && <Link href="/arte/oportunidades" className="btn btn-primary mt-6">Ver oportunidades</Link>}
      <div className="mt-8 grid gap-4 md:grid-cols-4">
        {COLS.map(([estados, titulo]) => {
          const col = apps.filter((a) => estados.includes(a.status));
          return (
            <section key={titulo}>
              <h2 className="eyebrow">{titulo} · {col.length}</h2>
              <div className="mt-2 space-y-2">
                {col.map((a) => {
                  const items = a.arte_application_items || [];
                  const hechos = items.filter((i) => i.done).length;
                  const vence = a.due_at && a.due_at >= today && Date.parse(a.due_at) - Date.parse(today) <= 7 * 864e5;
                  return (
                    <Link key={a.id} href={`/arte/postulaciones/${a.id}`} className="card block p-4 hover:shadow-sm">
                      <p className="display leading-snug">{a.arte_programs?.name}</p>
                      <p className="mt-1 text-xs muted">{a.arte_programs?.organizer}</p>
                      <div className="mt-3 flex items-center justify-between text-xs">
                        <span className={vence ? "font-medium text-[var(--accent)]" : "muted"}>{a.due_at ? `Cierra ${formatDay(a.due_at)}` : "Fecha a confirmar"}</span>
                        {items.length > 0 && <span className="muted">{hechos}/{items.length}</span>}
                      </div>
                      {items.length > 0 && <div className="mt-2 h-1 rounded-full bg-[var(--paper-2)]"><div className="h-1 rounded-full bg-[var(--ink)]" style={{ width: `${(hechos / items.length) * 100}%` }} /></div>}
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
