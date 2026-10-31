"use client";
import { useState, useTransition } from "react";
import { regenerateLetter, saveDossier, type DossierDraft } from "@/app/arte/(app)/postulaciones/[id]/dossier/actions";

interface W { id: string; title: string; year: string | null; thumb: string | null }

export function DossierEditor({ applicationId, initial, works, maxWorks }: { applicationId: string; initial: DossierDraft; works: W[]; maxWorks: number }) {
  const [d, setD] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(d) !== saved;

  const save = () => start(async () => { await saveDossier(applicationId, d); setSaved(JSON.stringify(d)); setNote("Guardado"); });
  const regen = () => start(async () => {
    const r = await regenerateLetter(applicationId);
    setD((x) => ({ ...x, letter: r.text }));
    setNote(r.usedAI ? "Borrador generado: revisalo y hacelo tuyo." : "Borrador armado con tu statement y tus obras (sin IA en este entorno).");
  });
  const toggle = (id: string) => setD((x) => ({ ...x, workIds: x.workIds.includes(id) ? x.workIds.filter((y) => y !== id) : x.workIds.length < maxWorks ? [...x.workIds, id] : x.workIds }));
  const field = (k: "letter" | "statement" | "bio", label: string, rows: string) => (
    <section className="card p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="display text-xl">{label}</h2>
        {k === "letter" && <button type="button" className="btn btn-ghost !py-1.5 text-sm" disabled={pending} onClick={regen}>{d.letter ? "Regenerar borrador" : "Generar borrador"}</button>}
      </div>
      <textarea className={`input mt-3 ${rows}`} value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} aria-label={label} placeholder={k === "letter" ? "Generá un borrador o escribí tu carta." : ""} />
    </section>
  );

  return (
    <div className="mt-6 space-y-4">
      {field("letter", "Carta de motivación", "min-h-72")}
      {field("statement", "Statement", "min-h-32")}
      {field("bio", "Biografía", "min-h-32")}

      <section className="card p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="display text-xl">Obras</h2>
          <span className="text-sm muted">{d.workIds.length}/{maxWorks} · el orden es el de selección</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 md:grid-cols-6">
          {works.map((w) => {
            const i = d.workIds.indexOf(w.id);
            return (
              <button key={w.id} type="button" onClick={() => toggle(w.id)} aria-pressed={i >= 0} aria-label={w.title}
                className={`relative aspect-square overflow-hidden rounded-lg border-2 ${i >= 0 ? "border-[var(--ink)]" : "border-transparent opacity-45"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {w.thumb && <img src={w.thumb} alt="" className="h-full w-full object-cover" />}
                {i >= 0 && <span className="absolute left-1 top-1 rounded-full bg-[var(--ink)] px-1.5 text-xs text-[var(--paper)]">{i + 1}</span>}
              </button>
            );
          })}
        </div>
        {!works.length && <p className="mt-2 text-sm muted">Todavía no cargaste obras con imagen.</p>}
      </section>

      <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-full border border-[var(--line)] bg-[var(--paper)] p-2 pl-4 shadow-sm">
        <span className="text-sm muted">Plantilla</span>
        {(["editorial", "minimal"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setD({ ...d, template: t })} className={`pill ${d.template === t ? "bg-[var(--ink)] text-[var(--paper)] border-transparent" : ""}`}>{t === "editorial" ? "Editorial" : "Minimal"}</button>
        ))}
        <span className="ml-auto text-sm muted">{note}</span>
        <button type="button" className="btn btn-ghost" disabled={pending || !dirty} onClick={save}>{dirty ? "Guardar" : "Guardado"}</button>
        <a className={`btn btn-primary ${dirty ? "pointer-events-none opacity-50" : ""}`} href={`/api/arte/dossier/${applicationId}?template=${d.template}`} aria-disabled={dirty}>Descargar PDF</a>
      </div>
    </div>
  );
}
