"use client";
import { useRef, useState, useTransition } from "react";
import { createBrowserSupabase } from "@/lib/arte/supabase-browser";
import { deleteWork, upsertWork } from "@/app/arte/(app)/perfil/actions";
import type { ArteWork } from "@/lib/arte/types";

/** Technical-sheet editor for one work; images go straight to the artist's private storage folder. */
export function WorkForm({ userId, work, previews, onDone }: { userId: string; work?: ArteWork; previews?: Record<string, string>; onDone?: () => void }) {
  const [images, setImages] = useState<string[]>(work?.images || []);
  const [local, setLocal] = useState<Record<string, string>>({});
  const [subiendo, setSubiendo] = useState(false);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  async function subir(files: FileList | null) {
    if (!files?.length) return;
    setSubiendo(true);
    const supabase = createBrowserSupabase();
    for (const f of Array.from(files)) {
      const path = `${userId}/works/${crypto.randomUUID()}.${(f.name.split(".").pop() || "jpg").toLowerCase()}`;
      const { error } = await supabase.storage.from("arte-private").upload(path, f, { contentType: f.type, upsert: false });
      if (!error) { setImages((x) => [...x, path]); setLocal((m) => ({ ...m, [path]: URL.createObjectURL(f) })); }
    }
    setSubiendo(false);
  }

  return (
    <form action={(fd) => start(async () => { fd.set("images", images.join(",")); await upsertWork(fd); onDone?.(); })} className="card space-y-3 p-5">
      {work && <input type="hidden" name="id" value={work.id} />}
      <div className="flex flex-wrap gap-2">
        {images.map((p) => (
          <div key={p} className="relative h-24 w-24 overflow-hidden rounded-lg bg-[var(--paper-2)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {(local[p] || previews?.[p]) && <img src={local[p] || previews?.[p]} alt="" className="h-full w-full object-cover" />}
            <button type="button" onClick={() => setImages(images.filter((x) => x !== p))} className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs text-white" aria-label="Quitar imagen">×</button>
          </div>
        ))}
        <button type="button" onClick={() => fileRef.current?.click()} className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed border-[var(--line)] text-sm muted">
          {subiendo ? "Subiendo…" : "+ Imagen"}
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => subir(e.target.files)} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <input className="input" name="title" placeholder="Título" defaultValue={work?.title} required aria-label="Título" />
        <input className="input" name="year" placeholder="Año" defaultValue={work?.year ?? ""} aria-label="Año" />
        <input className="input" name="technique" placeholder="Técnica (ej. óleo sobre tela)" defaultValue={work?.technique ?? ""} aria-label="Técnica" />
        <input className="input" name="dimensions" placeholder="Medidas (ej. 100 x 80 cm)" defaultValue={work?.dimensions ?? ""} aria-label="Medidas" />
        <input className="input md:col-span-2" name="series" placeholder="Serie (opcional)" defaultValue={work?.series ?? ""} aria-label="Serie" />
      </div>
      <textarea className="input min-h-24" name="description" placeholder="Texto de la obra: qué es, cómo se hizo, qué pregunta." defaultValue={work?.description ?? ""} aria-label="Descripción" />
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="public" defaultChecked={work?.public} /> Mostrar en mi portfolio público</label>
        <div className="flex gap-2">
          {work && <button type="button" className="btn btn-ghost" onClick={() => start(async () => { await deleteWork(work.id); onDone?.(); })}>Borrar</button>}
          <button className="btn btn-primary" disabled={pending || subiendo}>{pending ? "Guardando…" : "Guardar obra"}</button>
        </div>
      </div>
    </form>
  );
}
