"use client";
import { useState } from "react";
import { WorkForm } from "./WorkForm";
import type { ArteWork } from "@/lib/arte/types";

export function WorkGrid({ userId, works, previews }: { userId: string; works: ArteWork[]; previews: Record<string, string> }) {
  const [editando, setEditando] = useState<string | null>(works.length ? null : "nueva");
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
            <button key={w.id} onClick={() => setEditando(w.id)} className="card overflow-hidden text-left transition hover:shadow-sm">
              <div className="aspect-[4/3] bg-[var(--paper-2)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {w.images[0] && previews[w.images[0]] && <img src={previews[w.images[0]]} alt={w.title} className="h-full w-full object-cover" />}
              </div>
              <div className="p-4">
                <p className="display text-lg leading-tight">{w.title}</p>
                <p className="mt-1 text-sm muted">{[w.year, w.technique, w.dimensions].filter(Boolean).join(" · ") || "Completá la ficha técnica"}</p>
                {(!w.technique || !w.dimensions) && <span className="pill pill-accent mt-2">Falta ficha</span>}
              </div>
            </button>
          ),
        )}
      </div>
    </div>
  );
}
