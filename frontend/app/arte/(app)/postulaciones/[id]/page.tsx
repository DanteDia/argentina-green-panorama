import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/arte/supabase-server";
import { programState } from "@/lib/arte/dates";
import { Checklist, Notes, StatusPicker } from "@/components/arte/AppDetail";
import { deleteApplication } from "../actions";
import type { AppStatus, Program } from "@/lib/arte/types";

export default async function Postulacion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: app } = await supabase.from("arte_applications").select("*, arte_programs(*)").eq("id", id).maybeSingle();
  if (!app) notFound();
  const { data: items } = await supabase.from("arte_application_items").select("id, label, done, due_at").eq("application_id", id).order("sort");
  const p = app.arte_programs as Program;
  const st = programState(p, new Date());
  const hechos = (items || []).filter((i) => i.done).length;

  return (
    <div className="max-w-4xl">
      <Link href="/arte/postulaciones" className="eyebrow">← Postulaciones</Link>
      <h1 className="display mt-3 text-4xl leading-tight">{p.name}</h1>
      <p className="mt-1 muted">{[p.organizer, p.type].filter(Boolean).join(" · ")} · {st.text}</p>
      <div className="mt-4"><StatusPicker id={id} status={app.status as AppStatus} /></div>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_300px]">
        <section className="card p-5">
          <div className="flex items-baseline justify-between"><h2 className="display text-xl">Qué falta</h2><span className="text-sm muted">{hechos}/{items?.length || 0}</span></div>
          <div className="mt-2"><Checklist items={items || []} /></div>
        </section>
        <aside className="space-y-4">
          <Link href={`/arte/postulaciones/${id}/dossier`} className="card block p-5 hover:shadow-sm">
            <p className="eyebrow">Dossier</p>
            <p className="display mt-1 text-xl">Armar mi postulación →</p>
            <p className="mt-1 text-sm muted">Carta, bio, CV y obras elegidas para esta convocatoria, en un PDF listo.</p>
          </Link>
          {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="btn btn-ghost w-full justify-center">Bases oficiales ↗</a>}
        </aside>
      </div>

      <section className="mt-6"><h2 className="eyebrow">Notas</h2><div className="mt-2"><Notes id={id} initial={app.notes || ""} /></div></section>
      <form action={deleteApplication.bind(null, id)} className="mt-8"><button className="text-sm muted hover:text-[var(--accent)]">Eliminar esta postulación</button></form>
    </div>
  );
}
