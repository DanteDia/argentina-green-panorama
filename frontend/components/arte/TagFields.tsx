"use client";
import { useState, useTransition } from "react";
import { aiTags } from "@/app/arte/(app)/perfil/actions";

/** Disciplines and themes of the profile form, with a button that reads them from the artist's works and texts. */
export function TagFields({ mediums, themes }: { mediums: string; themes: string }) {
  const [m, setM] = useState(mediums);
  const [t, setT] = useState(themes);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const suggest = () => start(async () => {
    const r = await aiTags().catch(() => null);
    if (!r) { setNote("No pudimos leerlas ahora. Probá de nuevo en un momento."); return; }
    if (r.mediums.length) setM(r.mediums.join(", "));
    if (r.themes.length) setT(r.themes.join(", "));
    setNote("Revisalas y tocá Guardar datos.");
  });
  return (
    <>
      <label className="block text-sm"><span className="text-[var(--ink-2)]">Disciplinas (separadas por coma)</span>
        <input className="input mt-1" name="mediums" value={m} onChange={(e) => setM(e.target.value)} placeholder="instalación, fotografía, cerámica" /></label>
      <label className="block text-sm"><span className="text-[var(--ink-2)]">Temas de tu obra</span>
        <input className="input mt-1" name="themes" value={t} onChange={(e) => setT(e.target.value)} placeholder="identidad, tecnología, materia" /></label>
      <p className="-mt-2 flex flex-wrap items-center gap-2 text-xs md:col-span-2">
        <button type="button" className="underline" disabled={pending} onClick={suggest}>{pending ? "Leyendo tu obra…" : "Sugerir disciplinas y temas con IA"}</button>
        {note && <span className="muted" role="status">{note}</span>}
      </p>
    </>
  );
}
