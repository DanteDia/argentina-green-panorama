import { requireUser } from "@/lib/arte/supabase-server";
import { loadStudio } from "@/lib/arte/data";
import { ProfileTabs } from "@/components/arte/ProfileTabs";
import { deleteCvItem, upsertCvItem } from "../actions";
import { CV_KINDS as KINDS } from "@/lib/arte/cv";
import { CvPaste } from "@/components/arte/CvPaste";

// the AI drafts started from this page are server actions that wait up to 45 s for the model (lib/arte/llm.ts)
export const maxDuration = 60;

export default async function Cv() {
  const { user, supabase } = await requireUser();
  const { cv } = await loadStudio(supabase, user.id);
  return (
    <div className="max-w-4xl">
      <p className="eyebrow">Perfil</p>
      <h1 className="display mt-2 text-4xl">CV</h1>
      <p className="mt-2 muted">Cuando te seleccionan en una postulación, se suma solo.</p>
      <ProfileTabs />
      <CvPaste />
      <p className="mt-6 text-sm muted">O sumá una línea a mano:</p>
      <form action={upsertCvItem} className="card mt-2 grid gap-3 p-5 md:grid-cols-6">
        <select name="kind" className="input md:col-span-2" aria-label="Tipo">{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <input name="title" className="input md:col-span-4" placeholder="Título (muestra, premio, carrera…)" required aria-label="Título" />
        <input name="org" className="input md:col-span-2" placeholder="Institución / espacio" aria-label="Institución" />
        <input name="city" className="input" placeholder="Ciudad" aria-label="Ciudad" />
        <input name="country" className="input" placeholder="País" aria-label="País" />
        <input name="year" className="input" placeholder="Año" aria-label="Año" />
        <button className="btn btn-primary justify-center">Agregar</button>
      </form>
      <div className="mt-6 space-y-6">
        {KINDS.map(([k, l]) => {
          const items = cv.filter((c) => c.kind === k);
          if (!items.length) return null;
          return (
            <section key={k}>
              <h2 className="eyebrow">{l}</h2>
              <ul className="mt-2 divide-y divide-[var(--line)] card">
                {items.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                    <span><span className="muted mr-3 tabular-nums">{c.year || "—"}</span><span className="font-medium">{c.title}</span>{c.org && c.org !== c.title && <span className="muted">, {c.org}</span>}{c.city && <span className="muted">, {c.city}</span>}
                      {c.source !== "manual" && <span className="pill ml-2">{c.source === "graph" ? "de la escena" : c.source === "application" ? "de una postulación" : "importado"}</span>}</span>
                    <form action={deleteCvItem.bind(null, c.id)}><button className="muted hover:text-[var(--accent)]" aria-label="Borrar">×</button></form>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
