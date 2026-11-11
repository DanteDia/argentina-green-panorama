import { checkEligibility } from "./eligibility";
import { programState, type ProgramState } from "./dates";
import { tier } from "./tiers";
import type { ArteProfile, ArteWork, CvItem, Program } from "./types";

export interface MatchContext {
  profile: ArteProfile;
  works: ArteWork[];
  cv: CvItem[];
  statement: string;
  appliedProgramIds: Set<string>;
  similarArtistNodeIds: Set<string>;
  now: Date;
  /** Words too frequent across calls to mean a connection (see commonWords); rankPrograms fills it in. */
  common?: Set<string>;
}
export interface Ranked { program: Program; score: number; reasons: string[]; effortDays: number; state: ProgramState; eligibilityNotes: string[] }

// Weights (tunable): fit 40 (discipline 15, digital 10, themes 15) · strategic 40 (type for stage 15, tier 15, alumni 10) · timing 20
const NO_VISUAL = /literatura|novela|poes[ií]a|m[uú]sica|danza|teatro|esc[eé]nic|dramaturg|coreograf|cine documental|guion/i;
const DIGITAL = /digital|tecnolog|new media|nuevos medios|interactiv|c[oó]digo|software|algor|dato|data|\bia\b|inteligencia artificial|virtual|net\.?art|electr[oó]nic|bioarte|sonoro|instalaci/i;
// Words that say nothing about a practice: every call and every bio has them, in Spanish or English
const STOP = new Set(("para como sobre entre desde hasta donde cuando porque esta este estos estas tiene tienen artistas artista obra obras convocatoria "
  + "programa programas abierta abierto arte artes visual visuales the and for with from that this "
  + "artist artists project projects proyecto proyectos trabajo trabajos practica practice world mundo international internacional nacional national "
  + "argentina argentino argentinos buenos aires latin america latinoamerica platform plataforma development desarrollo event events evento eventos "
  + "important importante across around through their there these those which while where about based years tambien traves mediante "
  + "contemporary contemporaneo contemporanea residency residencia open call calls application applications deadline artistic artistica artistico "
  + "connecting connect hosted program space espacio gallery galeria galleries research investigacion community comunidad support apoyo").split(" "));

const palabras = (s: string) => new Set((s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-zñ]{5,}/g) || []).filter((w) => !STOP.has(w)));

export function effortDays(prog: Program): number {
  const r = prog.requirements || {};
  return 2 + (r.letter ? 2 : 0) + (r.images_n || r.portfolio ? 1 : 0) + (r.project ? 3 : 0) + (r.budget ? 2 : 0) + (r.video ? 3 : 0) + (r.statement ? 1 : 0);
}

export function scoreProgram(ctx: MatchContext, prog: Program): { score: number; reasons: string[]; effortDays: number } {
  const reasons: string[] = [];
  const p = ctx.profile;
  const artistText = [p.mediums.join(" "), p.themes.join(" "), ctx.statement].join(" ");
  const progText = [prog.name, prog.discipline, prog.description, prog.type].join(" ");
  let score = 0;

  // fit · discipline
  if (prog.discipline && NO_VISUAL.test(prog.discipline) && !NO_VISUAL.test(p.mediums.join(" "))) {
    reasons.push(`Es de ${prog.discipline.toLowerCase()}, no de artes visuales`);
  } else score += 15;

  // fit · digital
  const artistDigital = DIGITAL.test(p.mediums.join(" ") + " " + p.themes.join(" "));
  if (prog.digital_focus || DIGITAL.test(progText)) {
    if (artistDigital) { score += 10; reasons.push("Tiene foco en arte y tecnología, como tu obra"); } else score += 3;
  } else if (!artistDigital) score += 5;

  // fit · themes
  const aw = palabras(artistText);
  if (aw.size < 4) {
    score += 5; reasons.push("Completá tu statement para afinar las recomendaciones");
  } else {
    const comunes = [...palabras(progText)].filter((w) => aw.has(w) && !ctx.common?.has(w));
    score += Math.min(15, comunes.length * 5);
    if (comunes.length) reasons.push(`Conecta con tu obra: ${comunes.slice(0, 3).join(", ")}`);
  }

  // strategic · type for career stage
  const t = (prog.type || "").toLowerCase();
  const stageFit = p.career_stage === "emerging"
    ? (/beca|residen|convocatoria|sal[oó]n|formaci|programa|mentor/.test(t) ? 15 : /premio/.test(t) ? 10 : 7)
    : (/premio|residen|beca|comisi/.test(t) ? 15 : 8);
  score += stageFit;
  if (p.career_stage === "emerging" && stageFit === 15) reasons.push("Buen tipo de oportunidad para tu momento de carrera");

  // strategic · tier
  const tr = tier(prog.name, prog.organizer);
  score += tr === "A" ? 15 : tr === "B" ? 11 : 6;
  if (tr === "A") reasons.push("Programa de referencia internacional");
  else if (tr === "B") reasons.push("Referencia en la escena argentina");

  // strategic · alumni similarity
  if (prog.alumni_node_ids?.some((id) => ctx.similarArtistNodeIds.has(id))) {
    score += 10; reasons.push("Artistas afines a vos pasaron por acá");
  }

  // timing / effort
  const st = programState(prog, ctx.now);
  const eff = effortDays(prog);
  if (st.label === "abierta") {
    if ((st.daysLeft ?? 0) >= eff) { score += 20; } else { score += 8; reasons.push(`Llegás justo: necesitás ~${eff} días`); }
  } else if (st.label === "cierra hoy") { score += 4; reasons.push("Cierra hoy"); }
  else if (st.label === "próxima") { score += 15; reasons.push("Abre pronto: podés prepararla con tiempo"); }
  else if (st.label === "recurrente") { score += 10; reasons.push("Para agendar: vuelve a abrir"); }

  return { score: Math.round(score), reasons, effortDays: eff };
}

/** Words that appear in many calls ("durante", "working", "materiales"): sharing them with a call is not a connection.
 *  Measured on the calls themselves, so it holds in any language without a hand-kept list. */
export function commonWords(programs: Program[]): Set<string> {
  const df = new Map<string, number>();
  for (const p of programs) for (const w of palabras([p.name, p.discipline, p.description, p.type].join(" "))) df.set(w, (df.get(w) ?? 0) + 1);
  const limit = Math.max(4, programs.length * 0.05);
  return new Set([...df].filter(([, n]) => n >= limit).map(([w]) => w));
}

/** Eligible, not applied, not closed-for-good; best first. */
export function rankPrograms(ctx0: MatchContext, programs: Program[]): Ranked[] {
  const ctx = { ...ctx0, common: ctx0.common ?? commonWords(programs) };
  const out: Ranked[] = [];
  for (const prog of programs) {
    if (ctx.appliedProgramIds.has(prog.id)) continue;
    const state = programState(prog, ctx.now);
    if (state.label === "cerrada") continue;
    const el = checkEligibility(ctx.profile, prog, ctx.now);
    if (!el.ok) continue;
    const s = scoreProgram(ctx, prog);
    out.push({ program: prog, score: s.score, reasons: s.reasons, effortDays: s.effortDays, state, eligibilityNotes: el.reasons });
  }
  return out.sort((a, b) => b.score - a.score || (a.program.closes_at || "9999").localeCompare(b.program.closes_at || "9999"));
}
