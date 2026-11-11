import type { ArteProfile, ArteWork, CvItem, TextSet } from "./types";

/** How ready the profile is to apply, 0–100, and what to do next (most valuable first, in Spanish). */
export function completeness(p: ArteProfile, works: ArteWork[], cv: CvItem[], texts: TextSet): { score: number; missing: string[]; todo: { label: string; href: string }[] } {
  const OBRAS = "/arte/perfil/obras", TEXTOS = "/arte/perfil#textos", CV = "/arte/perfil/cv", DATOS = "/arte/perfil#datos";
  const checks: [weight: number, ok: boolean, label: string, href: string][] = [];
  checks.push([20, works.length >= 6, works.length === 0 ? "obras (subí al menos 6 con imagen)" : `obras (tenés ${works.length}, sumá hasta 6)`, OBRAS]);
  checks.push([12, !!texts.statement?.es, "statement", TEXTOS]);
  checks.push([10, !!texts.bio_short?.es, "bio corta", TEXTOS]);
  checks.push([5, !!texts.bio_long?.es, "bio larga", TEXTOS]);
  checks.push([6, !!texts.bio_short?.en, "bio corta en inglés", TEXTOS]);
  checks.push([4, !!texts.statement?.en, "statement en inglés", TEXTOS]);
  const sinFicha = works.filter((w) => !w.technique || !w.dimensions).length;
  checks.push([10, works.length > 0 && sinFicha === 0, `fichas técnicas (${sinFicha} obras sin técnica o medidas)`, OBRAS]);
  checks.push([5, works.length > 0 && works.every((w) => w.images.length > 0), "imágenes en todas las obras", OBRAS]);
  checks.push([8, cv.length >= 3, "CV (formación, muestras, premios)", CV]);
  checks.push([5, !!p.name, "nombre", DATOS]);
  checks.push([4, !!p.birth_year && !!p.base_city, "año de nacimiento y ciudad", DATOS]);
  checks.push([4, !!p.website || !!p.instagram, "web o Instagram", DATOS]);
  checks.push([7, p.mediums.length > 0 && p.themes.length > 0, "disciplinas y temas de tu obra", DATOS]);

  const total = checks.reduce((s, [w]) => s + w, 0);
  const got = checks.reduce((s, [w, ok]) => s + (ok ? w : 0), 0);
  const todo = checks
    .filter(([, ok, label]) => !ok && !(label.startsWith("fichas técnicas") && works.length === 0))
    .sort((a, b) => b[0] - a[0])
    .map(([, , label, href]) => ({ label, href }));
  return { score: Math.round((got / total) * 100), missing: todo.map((t) => t.label), todo };
}
