"use client";
import { useState, useTransition } from "react";
import { deleteWork } from "@/app/arte/(app)/perfil/actions";
import { WorkForm } from "./WorkForm";
import type { ArteWork } from "@/lib/arte/types";

export function WorkGrid({ userId, works, previews }: { userId: string; works: ArteWork[]; previews: Record<string, string> }) {
  const [editando, setEditando] = useState<string | null>(works.length ? null : "nueva");
  const [quitar, setQuitar] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-6 space-y-6">
      {editando === "nueva" ? (
        <WorkForm userId={userId} onDone={() => setEditando(null)} />
      ) : (
        <button className="btn btn-primary" onClick={() => setEditando("nueva")}>+ Nueva obra</button>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {works.map((w) =>
          editando === w.id ? (
            <div key={w.id} className="sm:col-span-2 lg:col-span-3"><WorkForm userId={userId} work={w} previews={previews} onDone={() => setEditando(null)} /></div>
          ) : (
            <div key={w.id} className="card overflow-hidden">
              <button onClick={() => setEditando(w.id)} className="block w-full text-left transition hover:opacity-90" aria-label={`Editar ${w.title}`}>
                <div className="aspect-[4/3] bg-[var(--paper-2)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {w.images[0] && previews[w.images[0]] && <img src={previews[w.images[0]]} alt={w.title} className="h-full w-full object-cover" />}
                </div>
                <div className="px-4 pt-4">
                  <p className="display line-clamp-2 text-lg leading-tight">{w.title}</p>
                  <p className="mt-1 text-sm muted">{[w.year, w.technique, w.dimensions].filter(Boolean).join(" · ") || "Completá la ficha técnica"}</p>
                </div>
              </button>
              <div className="flex items-center justify-between gap-2 px-4 pb-4 pt-2 text-xs">
                {!w.technique || !w.dimensions ? <span className="pill pill-accent">Falta ficha</span> : <span />}
                {quitar === w.id ? (
                  <span className="flex items-center gap-2">¿Quitarla? <button className="underline" disabled={pending} onClick={() => start(async () => { await deleteWork(w.id); setQuitar(null); })}>{pending ? "Quitando…" : "Sí"}</button>
                    <button className="underline muted" onClick={() => setQuitar(null)}>No</button></span>
                ) : <button className="underline muted" onClick={() => setQuitar(w.id)}>No es una obra</button>}
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
