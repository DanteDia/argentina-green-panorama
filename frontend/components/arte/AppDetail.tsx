"use client";
import { useState, useTransition } from "react";
import { saveNotes, setStatus, toggleItem } from "@/app/arte/(app)/postulaciones/actions";
import type { AppStatus } from "@/lib/arte/types";

const ESTADOS: [AppStatus, string][] = [["preparing", "Preparando"], ["sent", "Enviada"], ["selected", "Seleccionado"], ["rejected", "No quedé"], ["withdrawn", "La dejé"]];

export function Checklist({ items }: { items: { id: string; label: string; done: boolean; due_at: string | null }[] }) {
  const [estado, setEstado] = useState(Object.fromEntries(items.map((i) => [i.id, i.done])));
  const [, start] = useTransition();
  return (
    <ul className="divide-y divide-[var(--line)]">
      {items.map((i) => (
        <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={estado[i.id]} onChange={(e) => { const v = e.target.checked; setEstado({ ...estado, [i.id]: v }); start(() => toggleItem(i.id, v)); }} />
            <span className={estado[i.id] ? "line-through muted" : ""}>{i.label}</span>
          </label>
          {i.due_at && <span className="text-xs muted tabular-nums">{new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(i.due_at + "T00:00:00Z"))}</span>}
        </li>
      ))}
    </ul>
  );
}

export function StatusPicker({ id, status }: { id: string; status: AppStatus }) {
  const [s, setS] = useState(status);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      {ESTADOS.map(([v, l]) => (
        <button key={v} type="button" disabled={pending} onClick={() => { setS(v); start(() => setStatus(id, v)); }}
          className={`pill ${s === v ? "bg-[var(--ink)] text-[var(--paper)] border-transparent" : ""}`}>{l}</button>
      ))}
    </div>
  );
}

export function Notes({ id, initial }: { id: string; initial: string }) {
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [, start] = useTransition();
  return (
    <textarea className="input min-h-28" value={v} placeholder="Notas: contactos, dudas, lo que te dijeron…" aria-label="Notas"
      onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== saved) start(async () => { await saveNotes(id, v); setSaved(v); }); }} />
  );
}
