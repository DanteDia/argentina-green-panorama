"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DraftProfile } from "@/lib/arte/import-map";
import { CV_KINDS } from "@/lib/arte/cv";
import { applyDraft } from "./actions";

const FOLLOWS_LATER = "No pudimos leer a quién seguís ahora. Podés reintentarlo después desde Descubrir.";
const MAX_WORKS = 12;   // what applyDraft imports
const PASOS = ["Leyendo tu Instagram y tus últimas publicaciones", "Leyendo tu web", "Buscándote en el mapa de la escena", "Armando tu borrador"];

export default function Onboarding() {
  const router = useRouter();
  const [web, setWeb] = useState("");
  const [ig, setIg] = useState("");
  const [nombre, setNombre] = useState("");
  const [paso, setPaso] = useState(-1);
  const [draft, setDraft] = useState<DraftProfile | null>(null);
  const [cvOn, setCvOn] = useState<boolean[]>([]);
  const [worksOn, setWorksOn] = useState<boolean[]>([]);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [follows, setFollows] = useState("");

  async function importar(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setPaso(0);
    const tick = setInterval(() => setPaso((p) => Math.min(p + 1, PASOS.length - 1)), 1800);
    try {
      const r = await fetch("/api/arte/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ website: web || undefined, instagram: ig || undefined, name: nombre || undefined }) });
      const d = (await r.json()) as DraftProfile;
      if (!r.ok) throw new Error((d as unknown as { error: string }).error);
      if (nombre && !d.profile.name) d.profile.name = nombre;
      setDraft(d); setCvOn(d.cv.map(() => true)); setWorksOn(d.works.map((_, i) => !d.returning && i < 8));
      // Slow part, in the background while the artist reviews the draft: who they follow seeds Descubrir and Invitar
      if (d.igPk) {
        setFollows("Leyendo a quién seguís en Instagram para armar tu escena…");
        fetch("/api/arte/import/follows", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pk: d.igPk }), keepalive: true })
          .then((x) => x.json()).then((f: { total?: number; inMap?: number; skipped?: boolean; error?: string }) =>
            setFollows(f.error ? FOLLOWS_LATER : f.total && !f.skipped ? `Leímos ${f.total} cuentas que seguís: ${f.inMap ?? 0} están en el mapa de la escena.` : ""))
          .catch(() => setFollows(FOLLOWS_LATER));
      }
    } catch (err) { setError(String(err instanceof Error ? err.message : err)); }
    finally { clearInterval(tick); setPaso(-1); }
  }

  function confirmar() {
    if (!draft) return;
    const elegido: DraftProfile = { ...draft, cv: draft.cv.filter((_, i) => cvOn[i]), works: draft.works.filter((_, i) => worksOn[i]) };
    start(async () => {
      try { setError(""); await applyDraft(elegido); router.push(draft.returning ? "/arte/perfil/obras" : "/arte/hoy"); }
      catch { setError("No pudimos guardar tu perfil. Tu borrador sigue acá: probá de nuevo."); }   // keep the draft on screen
    });
  }

  if (!draft) return (
    <div className="max-w-xl">
      <p className="eyebrow">Bienvenida</p>
      <h1 className="display mt-2 text-4xl md:text-5xl">Empecemos por lo que ya hiciste.</h1>
      <p className="mt-3 text-[var(--ink-2)]">Pegá tu web y tu Instagram. Leemos tu bio, tus obras y tu trayectoria en la escena, y armamos un borrador para que lo revises.</p>
      <form onSubmit={importar} className="mt-8 space-y-3">
        <input className="input" placeholder="Tu nombre artístico" value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label="Nombre" />
        <input className="input" placeholder="Tu web (ej. tunombre.com)" value={web} onChange={(e) => setWeb(e.target.value)} aria-label="Web" />
        <input className="input" placeholder="Tu Instagram (ej. @tunombre)" value={ig} onChange={(e) => setIg(e.target.value)} aria-label="Instagram" />
        <button className="btn btn-primary" disabled={paso >= 0 || (!web && !ig && !nombre)}>{paso >= 0 ? "Leyendo…" : "Armar mi perfil"}</button>
        <button type="button" className="btn btn-ghost ml-2" onClick={() => setDraft({ profile: { name: nombre }, texts: {}, cv: [], works: [], graphNodeId: null, warnings: [], sources: [] })}>Prefiero cargarlo a mano</button>
      </form>
      {paso >= 0 && <ol className="mt-8 space-y-2 text-sm">{PASOS.map((p, i) => <li key={p} className={i <= paso ? "" : "muted"}>{i < paso ? "✓" : i === paso ? "…" : "·"} {p}</li>)}</ol>}
      {error && <p className="mt-4 text-sm text-[var(--accent)]">{error}</p>}
    </div>
  );

  return (
    <div className="max-w-4xl">
      <p className="eyebrow">Revisá tu borrador</p>
      <h1 className="display mt-2 text-4xl">Esto es lo que encontramos</h1>
      {draft.sources.length > 0 && <p className="mt-2 text-sm muted">Fuentes: {draft.sources.join(" · ")}</p>}
      {draft.warnings.map((w) => <p key={w} className="mt-2 text-sm text-[var(--warn)]">{w}</p>)}
      {follows && <p className="mt-2 text-sm muted" role="status">{follows}</p>}

      <section className="card mt-6 grid gap-3 p-5 md:grid-cols-2">
        {([["name", "Nombre"], ["birth_year", "Año de nacimiento"], ["base_city", "Ciudad"], ["website", "Web"], ["instagram", "Instagram"], ["email_public", "Email de contacto"]] as const).map(([k, l]) => (
          <label key={k} className="text-sm"><span className="muted">{l}</span>
            <input className="input mt-1" value={(draft.profile[k] as string | number | undefined) ?? ""} onChange={(e) => setDraft({ ...draft, profile: { ...draft.profile, [k]: k === "birth_year" ? Number(e.target.value) || undefined : e.target.value } })} aria-label={l} />
          </label>
        ))}
      </section>

      <section className="card mt-4 p-5">
        <h2 className="display text-xl">Bio</h2>
        <textarea className="input mt-2 min-h-32" value={draft.texts.bio_long || ""} onChange={(e) => setDraft({ ...draft, texts: { ...draft.texts, bio_long: e.target.value } })} placeholder="Todavía no tenemos tu bio: escribila o pegala acá." aria-label="Bio" />
      </section>

      {draft.cv.length > 0 && (
        <section className="card mt-4 p-5">
          <h2 className="display text-xl">Trayectoria encontrada <span className="text-sm muted">({draft.cv.length})</span></h2>
          <p className="text-sm muted">Destildá lo que no corresponda.</p>
          <ul className="mt-3 grid gap-1 text-sm md:grid-cols-2">
            {draft.cv.map((c, i) => (
              <li key={i}><label className="flex items-start gap-2"><input type="checkbox" checked={cvOn[i]} onChange={() => setCvOn(cvOn.map((v, j) => (j === i ? !v : v)))} className="mt-1" />
                <span><span className="muted">{c.year || "—"}</span> {c.title} <span className="pill ml-1">{CV_KINDS.find(([k]) => k === c.kind)?.[1]}</span></span></label></li>
            ))}
          </ul>
        </section>
      )}

      {draft.returning && draft.works.length === 0 && <p className="card mt-4 p-5 text-sm">No encontramos imágenes nuevas: lo que hay en tu Instagram y tu web ya está en tus obras.</p>}
      {draft.works.length > 0 && (
        <section className="card mt-4 p-5">
          <h2 className="display text-xl">Tus imágenes</h2>
          <p className="text-sm muted">De tu Instagram y tu web. {draft.returning ? "Tocá las que quieras sumar" : "Elegí cuáles son obras"} (hasta 12): las importamos con el texto de la publicación y después ajustás la ficha.</p>
          <div className="mt-3 grid grid-cols-3 gap-2 md:grid-cols-6">
            {draft.works.map((w, i) => (
              <button key={i} type="button" disabled={!worksOn[i] && worksOn.filter(Boolean).length >= MAX_WORKS} onClick={() => setWorksOn(worksOn.map((v, j) => (j === i ? !v : v)))} className={`relative aspect-square overflow-hidden rounded-lg border-2 ${worksOn[i] ? "border-[var(--ink)]" : "border-transparent opacity-50"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={w.image_url} alt={w.title} title={w.title} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 flex gap-3">
        <button className="btn btn-primary" onClick={confirmar} disabled={pending || !draft.profile.name}>{pending ? "Guardando…" : "Confirmar y entrar"}</button>
        <button className="btn btn-ghost" onClick={() => setDraft(null)}>Volver</button>
      </div>
      {error && <p className="mt-3 text-sm text-[var(--accent)]" role="alert">{error}</p>}
    </div>
  );
}
