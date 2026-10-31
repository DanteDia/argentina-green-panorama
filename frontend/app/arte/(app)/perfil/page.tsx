import { requireUser } from "@/lib/arte/supabase-server";
import { loadStudio } from "@/lib/arte/data";
import { completeness } from "@/lib/arte/completeness";
import { Meter, ProfileTabs } from "@/components/arte/ProfileTabs";
import { TextEditor } from "@/components/arte/TextEditor";
import { saveProfile } from "./actions";

function Campo({ label, name, def, placeholder, type = "text" }: { label: string; name: string; def?: string | number | null; placeholder?: string; type?: string }) {
  return (
    <label className="block text-sm">
      <span className="text-[var(--ink-2)]">{label}</span>
      <input className="input mt-1" name={name} type={type} defaultValue={def ?? ""} placeholder={placeholder} />
    </label>
  );
}

export default async function Perfil() {
  const { user, supabase } = await requireUser();
  const s = await loadStudio(supabase, user.id);
  const p = s.profile;
  const c = completeness(p ?? ({ name: "", mediums: [], themes: [] } as never), s.works, s.cv, s.texts);
  return (
    <div className="max-w-4xl">
      <p className="eyebrow">Perfil</p>
      <h1 className="display mt-2 text-4xl">Tu estudio</h1>
      <p className="mt-2 muted">Lo cargás una vez. Lo usamos en cada postulación.</p>
      <ProfileTabs />
      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_280px]">
        <form action={saveProfile} className="card space-y-4 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Campo label="Nombre artístico" name="name" def={p?.name} />
            <Campo label="Año de nacimiento" name="birth_year" type="number" def={p?.birth_year} />
            <Campo label="Lugar de nacimiento" name="birth_place" def={p?.birth_place} />
            <Campo label="Ciudad donde vivís" name="base_city" def={p?.base_city} placeholder="Buenos Aires" />
            <Campo label="Web" name="website" def={p?.website} placeholder="https://" />
            <Campo label="Instagram" name="instagram" def={p?.instagram} placeholder="@usuario" />
            <Campo label="Disciplinas (separadas por coma)" name="mediums" def={p?.mediums.join(", ")} placeholder="instalación, fotografía, cerámica" />
            <Campo label="Temas de tu obra" name="themes" def={p?.themes.join(", ")} placeholder="identidad, tecnología, materia" />
            <label className="block text-sm"><span className="text-[var(--ink-2)]">Momento de carrera</span>
              <select name="career_stage" className="input mt-1" defaultValue={p?.career_stage || "emerging"}>
                <option value="emerging">Emergente</option><option value="mid">Media carrera</option><option value="established">Consolidada</option>
              </select>
            </label>
            <Campo label="Postulaciones por mes que querés hacer" name="monthly_budget" type="number" def={p?.monthly_budget ?? 2} />
            <Campo label="Nacionalidad (código)" name="nationality" def={p?.nationality ?? "AR"} />
            <Campo label="Residencia (código)" name="residence" def={p?.residence ?? "AR"} />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="portfolio_public" defaultChecked={p?.portfolio_public} /> Publicar mi portfolio en un link público</label>
          <button className="btn btn-primary">Guardar datos</button>
        </form>
        <div className="space-y-4">
          <Meter score={c.score} missing={c.missing} />
          {p?.slug && p.portfolio_public && <a className="btn btn-ghost w-full justify-center" href={`/arte/a/${p.slug}`} target="_blank">Ver mi portfolio público ↗</a>}
        </div>
      </div>
      <div className="mt-6 grid gap-4">
        <TextEditor kind="statement" initial={s.texts.statement || {}} />
        <div className="grid gap-4 md:grid-cols-2">
          <TextEditor kind="bio_short" initial={s.texts.bio_short || {}} />
          <TextEditor kind="bio_long" initial={s.texts.bio_long || {}} />
        </div>
      </div>
    </div>
  );
}
