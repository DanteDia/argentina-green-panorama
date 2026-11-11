"use client";
import { useState, useTransition } from "react";
import { aiDraft, aiTranslate, saveText } from "@/app/arte/(app)/perfil/actions";
import { AI_ERROR } from "@/lib/arte/ai-answer";
import type { Lang } from "@/lib/arte/types";

type Kind = "bio_short" | "bio_long" | "statement";
const LABEL: Record<Kind, { t: string; hint: string; max: number }> = {
  statement: { t: "Statement", hint: "Qué investiga tu obra y por qué. Es la base de todas tus cartas.", max: 2500 },
  bio_short: { t: "Bio corta", hint: "~80 palabras, en tercera persona. La que piden casi todas las convocatorias.", max: 700 },
  bio_long: { t: "Bio larga", hint: "Trayectoria completa: formación, muestras, premios, residencias.", max: 4000 },
};

export function TextEditor({ kind, initial }: { kind: Kind; initial: Partial<Record<Lang, string>> }) {
  const [lang, setLang] = useState<Lang>("es");
  const [val, setVal] = useState<Record<Lang, string>>({ es: initial.es || "", en: initial.en || "" });
  const [saved, setSaved] = useState<Record<Lang, string>>({ es: initial.es || "", en: initial.en || "" });
  const [pending, start] = useTransition();
  const [writing, startAI] = useTransition();
  const [note, setNote] = useState("");
  const [undo, setUndo] = useState<{ lang: Lang; text: string } | null>(null);
  const dirty = val[lang] !== saved[lang];
  // The AI draft only fills the box: nothing is saved (or shown on a public portfolio) until the artist reads it and hits Guardar
  const ai = () => startAI(async () => {
    setNote("");
    const before = val[lang];
    const r = await (lang === "es" ? aiDraft(kind, before) : aiTranslate(val.es)).catch(() => ({ error: "unavailable" as const }));
    if ("error" in r) { setNote(AI_ERROR[r.error]); return; }
    const text = r.value;
    setVal((v) => ({ ...v, [lang]: text }));
    setUndo({ lang, text: before });
    setNote(lang === "es" ? "Borrador listo: leelo, hacelo tuyo y tocá Guardar." : "Translation ready: read it and press Guardar.");
  });
  const aiLabel = lang === "en" ? "Traducir del español" : val.es.trim() ? "Pulir con IA" : "Escribir con IA";
  const words = val[lang].trim() ? val[lang].trim().split(/\s+/).length : 0;
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <h3 className="display text-xl">{LABEL[kind].t}</h3>
        <div className="flex gap-1">
          {(["es", "en"] as Lang[]).map((l) => (
            <button key={l} type="button" onClick={() => setLang(l)} className={`pill ${lang === l ? "bg-[var(--ink)] text-[var(--paper)] border-transparent" : ""}`}>{l.toUpperCase()}</button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-sm muted">{LABEL[kind].hint}</p>
      <textarea className="input mt-3 min-h-36 leading-relaxed" maxLength={LABEL[kind].max} value={val[lang]} readOnly={writing}
        onChange={(e) => setVal({ ...val, [lang]: e.target.value })} aria-label={`${LABEL[kind].t} (${lang})`}
        placeholder={lang === "en" ? "English version: write it, or translate the Spanish one with one click." : "Escribilo con tus palabras, o dejá que lo escribamos con lo que ya cargaste."} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-ghost !py-1.5 text-sm" disabled={writing || pending || (lang === "en" && !val.es.trim())} onClick={ai}>{writing ? "Escribiendo…" : aiLabel}</button>
        {undo && undo.lang === lang && !writing && <button type="button" className="text-xs underline muted" onClick={() => { setVal((v) => ({ ...v, [undo.lang]: undo.text })); setUndo(null); setNote(""); }}>Deshacer</button>}
        {note && <span className="text-xs text-[var(--ink-2)]" role="status">{note}</span>}
        {lang === "es" && !val.es.trim() && !note && <span className="text-xs muted">o tirá dos líneas sueltas y tocá el botón: las ordenamos por vos.</span>}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs muted">
        <span>{words} palabras</span>
        <button type="button" disabled={!dirty || pending} className="btn btn-primary !py-1.5 disabled:opacity-40"
          onClick={() => start(async () => { await saveText(kind, lang, val[lang]); setSaved({ ...saved, [lang]: val[lang] }); setUndo(null); setNote(""); })}>
          {pending ? "Guardando…" : dirty ? "Guardar" : "Guardado"}
        </button>
      </div>
    </div>
  );
}
