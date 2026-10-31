import type { ArteProfile, ArteWork, CvItem, TextSet } from "./types";

/** How ready the profile is to apply, 0–100, and what to do next (most valuable first, in Spanish). */
export function completeness(p: ArteProfile, works: ArteWork[], cv: CvItem[], texts: TextSet): { score: number; missing: string[] } {
  const checks: [weight: number, ok: boolean, label: string][] = [];
  checks.push([20, works.length >= 6, works.length === 0 ? "obras (subí al menos 6 con imagen)" : `obras (tenés ${works.length}, sumá hasta 6)`]);
  checks.push([12, !!texts.statement?.es, "statement"]);
  checks.push([10, !!texts.bio_short?.es, "bio corta"]);
  checks.push([5, !!texts.bio_long?.es, "bio larga"]);
  checks.push([6, !!texts.bio_short?.en, "bio corta en inglés"]);
  checks.push([4, !!texts.statement?.en, "statement en inglés"]);
  const sinFicha = works.filter((w) => !w.technique || !w.dimensions).length;
  checks.push([10, works.length > 0 && sinFicha === 0, `fichas técnicas (${sinFicha} obras sin técnica o medidas)`]);
  checks.push([5, works.length > 0 && works.every((w) => w.images.length > 0), "imágenes en todas las obras"]);
  checks.push([8, cv.length >= 3, "CV (formación, muestras, premios)"]);
  checks.push([5, !!p.name, "nombre"]);
  checks.push([4, !!p.birth_year && !!p.base_city, "año de nacimiento y ciudad"]);
  checks.push([4, !!p.website || !!p.instagram, "web o Instagram"]);
  checks.push([7, p.mediums.length > 0 && p.themes.length > 0, "disciplinas y temas de tu obra"]);

  const total = checks.reduce((s, [w]) => s + w, 0);
  const got = checks.reduce((s, [w, ok]) => s + (ok ? w : 0), 0);
  const missing = checks
    .filter(([, ok, label]) => !ok && !(label.startsWith("fichas técnicas") && works.length === 0))
    .sort((a, b) => b[0] - a[0])
    .map(([, , label]) => label);
  return { score: Math.round((got / total) * 100), missing };
}
