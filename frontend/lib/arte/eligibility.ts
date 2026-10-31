import type { ArteProfile, Program } from "./types";

const LATAM = new Set(["AR", "BO", "BR", "CL", "CO", "CR", "CU", "DO", "EC", "SV", "GT", "HN", "MX", "NI", "PA", "PY", "PE", "PR", "UY", "VE", "HT", "JM", "TT"]);

/** Hard filter. Missing artist data never excludes: it becomes a 'confirmá …' reason instead. */
export function checkEligibility(p: ArteProfile, prog: Program, now: Date): { ok: boolean; reasons: string[] } {
  const e = prog.eligibility || {};
  const reasons: string[] = [];
  let ok = true;
  const nat = (p.nationality || "AR").toUpperCase();
  const res = (p.residence || "AR").toUpperCase();

  if (prog.for_argentines && /restringid/i.test(prog.for_argentines)) {
    ok = false; reasons.push("Restringida a artistas de otra nacionalidad");
  }
  if (e.nationality?.length && !e.nationality.includes("ANY")) {
    const pasa = e.nationality.some((n) => n === nat || (n === "LATAM" && LATAM.has(nat)))
      || (e.residence?.includes(res) ?? false);
    if (!pasa) { ok = false; reasons.push("Pide otra nacionalidad"); }
  }
  if (e.residence?.length && !e.residence.includes(res) && !(e.nationality?.includes(nat))) {
    ok = false; reasons.push("Pide residencia en otro país");
  }
  if (e.age_min || e.age_max) {
    if (!p.birth_year) reasons.push("Confirmá tu año de nacimiento: tiene límite de edad");
    else {
      const age = now.getUTCFullYear() - p.birth_year;
      if (e.age_min && age < e.age_min) { ok = false; reasons.push(`Pide edad mínima de ${e.age_min}`); }
      if (e.age_max && age > e.age_max) { ok = false; reasons.push(`Supera la edad máxima (${e.age_max})`); }
    }
  }
  if (e.career_stage?.length && !e.career_stage.includes(p.career_stage)) {
    ok = false; reasons.push("Es para otro momento de carrera");
  }
  return { ok, reasons };
}
