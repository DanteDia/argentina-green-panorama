"use client";
import { useState, useTransition } from "react";
import { saveText } from "@/app/arte/(app)/perfil/actions";
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
  const dirty = val[lang] !== saved[lang];
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
      <textarea className="input mt-3 min-h-36 leading-relaxed" maxLength={LABEL[kind].max} value={val[lang]}
        onChange={(e) => setVal({ ...val, [lang]: e.target.value })} aria-label={`${LABEL[kind].t} (${lang})`}
        placeholder={lang === "en" ? "English version (we can draft it for you from the Spanish one)" : "Escribilo con tus palabras."} />
      <div className="mt-2 flex items-center justify-between text-xs muted">
        <span>{words} palabras</span>
        <button type="button" disabled={!dirty || pending} className="btn btn-primary !py-1.5 disabled:opacity-40"
          onClick={() => start(async () => { await saveText(kind, lang, val[lang]); setSaved({ ...saved, [lang]: val[lang] }); })}>
          {pending ? "Guardando…" : dirty ? "Guardar" : "Guardado"}
        </button>
      </div>
    </div>
  );
}
