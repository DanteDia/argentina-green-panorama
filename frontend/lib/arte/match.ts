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
  /** Names of spaces the artist follows or is linked to in the scene map (the CV's are read from `cv`). */
  sceneNames?: Set<string>;
  /** Share of calls that contain each word (see wordShare); rankPrograms fills it in. */
  share?: Map<string, number>;
}
export interface Ranked { program: Program; score: number; reasons: string[]; effortDays: number; state: ProgramState; eligibilityNotes: string[] }

// Weights (tunable): fit 40 (discipline 15, digital 10, themes 15) · strategic 50 (type for stage 15, tier 25, your scene 10) · timing 20 · stated cost up to +5 · capped at 100
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

const artistWords = (ctx: MatchContext) => palabras([ctx.profile.mediums.join(" "), ctx.profile.themes.join(" "), ctx.statement].join(" "));

/** True while the artist hasn't said enough about their work for theme matching: recommendations are generic until then. */
export const needsStatement = (ctx: MatchContext) => artistWords(ctx).size < 4;

// Words that say what kind of space it is, and connectors: on their own they name nothing
const KIND = new Set("galeria fundacion museo centro espacio instituto universidad residencia premio programa asociacion".split(" "));
const FILLER = new Set([...KIND, ..."arte artes cultural de del la el los las y e en the of for and".split(" ")]);
const tokens = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter(Boolean);

/** Whether two names are the same space: equal as written, or equal once the words every space shares are gone
 *  ("Acéfala Galería" = "Acéfala"). A single leftover word is weak, so the kinds must not contradict each other:
 *  "Universidad del Cine" is not "Fundación Cine". */
function sameSpace(a: string, b: string): boolean {
  const ta = tokens(a), tb = tokens(b);
  if (ta.length && ta.join(" ") === tb.join(" ")) return true;
  const ka = ta.filter((w) => !FILLER.has(w)), kb = tb.filter((w) => !FILLER.has(w));
  if (ka.join(" ") !== kb.join(" ") || ka.join(" ").length < 4) return false;
  if (ka.length > 1) return true;
  const kindA = ta.filter((w) => KIND.has(w)), kindB = tb.filter((w) => KIND.has(w));
  return !kindA.length || !kindB.length || kindA.some((w) => kindB.includes(w));
}

/**
 * The organiser that is a space from the artist's confirmed CV, follows or scene map, or null. Either the whole line
 * is that space ("Nilo, galpón de arte") or one of the organisers in it is ("UNTREF / MUNTREF + Instituto Francés"):
 * a name merely contained in a longer one is someone else ("La Nación" is not "Secretaría de Cultura de la Nación").
 */
function knownOrganizer(ctx: MatchContext, organizer: string | null): string | null {
  if (!organizer) return null;
  const mine = [...ctx.cv.filter((c) => c.confirmed).map((c) => c.org), ...(ctx.sceneNames ?? [])].filter((n): n is string => !!n);
  const parts = [organizer, ...organizer.split(/[/+,;()—–]|\s-\s/)].map((p) => p.trim()).filter(Boolean);
  return parts.find((p) => mine.some((n) => sameSpace(n, p))) ?? null;
}

export function effortDays(prog: Program): number {
  const r = prog.requirements || {};
  return 2 + (r.letter ? 2 : 0) + (r.images_n || r.portfolio ? 1 : 0) + (r.project ? 3 : 0) + (r.budget ? 2 : 0) + (r.video ? 3 : 0) + (r.statement ? 1 : 0);
}

export function scoreProgram(ctx: MatchContext, prog: Program): { score: number; reasons: string[]; effortDays: number } {
  const reasons: string[] = [];
  const p = ctx.profile;
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
  const aw = artistWords(ctx);
  if (needsStatement(ctx)) {
    score += 5;   // too little to match on: the pages say so once (needsStatement), not on every card
  } else {
    // Measured on the real calls: words in 10%+ of them are call vocabulary (premio, residency, international); real themes
    // and mediums sit lower (fotografía ~5%, tecnología ~4%). What the artist declared always counts; a word is only
    // *named* as the connection when it is declared or rare (<3% of calls), so the reason never reads as filler.
    const declared = palabras(p.mediums.join(" ") + " " + p.themes.join(" "));
    const share = (w: string) => ctx.share?.get(w) ?? 0;
    const comunes = [...palabras(progText)].filter((w) => aw.has(w) && (declared.has(w) || share(w) < 0.1));
    score += Math.min(15, comunes.length * 5);
    const citar = comunes.filter((w) => declared.has(w) || share(w) < 0.03);
    if (citar.length) reasons.push(`Conecta con tu obra: ${citar.slice(0, 3).join(", ")}`);
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
  // a reference programme has to outrank the hundreds of calls read from listing sites, whose standing nobody checked.
  // Weights, not a hard rule: a much closer fit to the artist's work can still put an unknown call above a tier-B one.
  score += tr === "A" ? 25 : tr === "B" ? 18 : 6;
  if (tr === "A") reasons.push("Programa de referencia internacional");
  else if (tr === "B") reasons.push("Referencia en la escena argentina");

  // strategic · your scene (10, counted once): a space you already know runs it, or artists close to you went through it
  const known = knownOrganizer(ctx, prog.organizer);
  if (known) {
    score += 10; reasons.push(`La organiza ${known}, que ya es parte de tu escena`);
  } else if (prog.alumni_node_ids?.some((id) => ctx.similarArtistNodeIds.has(id))) {
    score += 10; reasons.push("Artistas afines a vos pasaron por acá");
  }

  // what it costs (only when the listing says so): being paid to go beats going free, and both beat paying
  if (prog.cost === "funded") { score += 5; reasons.push("Con apoyo económico: te pagan o te cubren el viaje"); }
  else if (prog.cost === "free") { score += 3; reasons.push("Sin costo de residencia"); }

  // timing / effort
  const st = programState(prog, ctx.now);
  const eff = effortDays(prog);
  if (st.label === "abierta") {
    if ((st.daysLeft ?? 0) >= eff) { score += 20; } else { score += 8; reasons.push(`Llegás justo: necesitás ~${eff} días`); }
  } else if (st.label === "cierra hoy") { score += 4; reasons.push("Cierra hoy"); }
  else if (st.label === "próxima") { score += 15; reasons.push(st.projected ? "Por su calendario habitual, conviene prepararla ahora" : "Abre pronto: podés prepararla con tiempo"); }
  else if (st.label === "recurrente") { score += 10; reasons.push("Para agendar: vuelve a abrir"); }

  return { score: Math.min(100, Math.round(score)), reasons, effortDays: eff };
}

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f.]/g, "");

/** Free-text search over what an artist would type: name, organiser, country, what it offers. Accents, case and dots
 *  do not matter ("espana", "eeuu"), and a country written as an abbreviation is also found by its name. */
export function matchesSearch(p: Program, q: string): boolean {
  const hay = fold([p.name, p.organizer, p.country, p.description, p.benefit].filter(Boolean).join(" "));
  return (hay + (/\beeuu\b/.test(hay) ? " estados unidos usa" : "")).includes(fold(q).trim());
}

/** Share of calls containing each word. Under 30 calls the numbers mean nothing, so nothing is discounted. */
export function wordShare(programs: Program[]): Map<string, number> {
  const df = new Map<string, number>();
  if (programs.length < 30) return df;
  for (const p of programs) for (const w of palabras([p.name, p.discipline, p.description, p.type].join(" "))) df.set(w, (df.get(w) ?? 0) + 1);
  return new Map([...df].map(([w, n]) => [w, n / programs.length]));
}

/** Eligible, not applied, not closed-for-good; best first. */
export function rankPrograms(ctx0: MatchContext, programs: Program[]): Ranked[] {
  const ctx = { ...ctx0, share: ctx0.share ?? wordShare(programs) };
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
