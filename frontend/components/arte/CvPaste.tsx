"use client";
import { useState, useTransition } from "react";
import { addCvItems, aiCvFromText } from "@/app/arte/(app)/perfil/actions";
import { CV_KINDS } from "@/lib/arte/cv";
import type { CvDraftItem } from "@/lib/arte/cv-parse";

const LABEL = Object.fromEntries(CV_KINDS);

/** Paste the CV as it is (from a Word file, a PDF, a website): we sort it into entries, the artist unticks what's wrong and adds the rest. */
export function CvPaste() {
  const [text, setText] = useState("");
  const [items, setItems] = useState<CvDraftItem[] | null>(null);
  const [on, setOn] = useState<boolean[]>([]);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  const read = () => start(async () => {
    setNote("");
    const r = await aiCvFromText(text).catch(() => null);
    if (r === null) { setNote("No pudimos leerlo ahora. Probá de nuevo en un momento."); return; }
    if (!r.length) { setNote("No encontramos muestras, premios ni formación en ese texto."); return; }
    setItems(r); setOn(r.map(() => true));
  });
  const add = () => start(async () => {
    try {
      const n = await addCvItems(items!.filter((_, i) => on[i]));
      setItems(null); setText(""); setNote(n ? `Listo: sumamos ${n} ${n === 1 ? "línea" : "líneas"} a tu CV.` : "Eso ya estaba en tu CV.");
    } catch { setNote("No pudimos guardarlo. Probá de nuevo."); }
  });

  if (items) return (
    <div className="card mt-6 p-5">
      <p className="text-sm font-medium">Encontramos {items.length} {items.length === 1 ? "línea" : "líneas"}. Destildá lo que esté mal.</p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {items.map((c, i) => (
          <li key={i}><label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={on[i]} onChange={() => setOn(on.map((v, j) => (j === i ? !v : v)))} />
            <span><span className="muted tabular-nums">{c.year || "—"}</span> <span className="font-medium">{c.title}</span>{c.org && c.org !== c.title && <span className="muted">, {c.org}</span>}{c.city && <span className="muted">, {c.city}</span>} <span className="pill ml-1">{LABEL[c.kind]}</span></span></label></li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary" disabled={pending || !on.some(Boolean)} onClick={add}>{pending ? "Guardando…" : `Agregar ${on.filter(Boolean).length} al CV`}</button>
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => setItems(null)}>Volver</button>
        {note && <span className="text-sm muted" role="status">{note}</span>}
      </div>
    </div>
  );

  return (
    <div className="card mt-6 p-5">
      <p className="text-sm font-medium">Pegá tu CV como lo tengas</p>
      <p className="text-sm muted">Copialo de tu Word, tu PDF o tu web. Lo ordenamos en muestras, premios, becas, residencias y formación.</p>
      <textarea className="input mt-3 min-h-28" value={text} onChange={(e) => setText(e.target.value)} readOnly={pending} aria-label="Tu CV en texto" placeholder={"2026 — Frecuencias Híbridas, Acéfala Galería, Buenos Aires (colectiva)\n2024 — Beca de creación, Fondo Nacional de las Artes\n…"} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary" disabled={pending || !text.trim()} onClick={read}>{pending ? "Leyendo tu CV…" : "Ordenar mi CV"}</button>
        {note && <span className="text-sm muted" role="status">{note}</span>}
      </div>
    </div>
  );
}
