import type { ArteProfile, ArteWork, CvItem, Program, TextSet } from "./types";
import { CV_KINDS } from "./cv";

export interface DossierCtx { profile: ArteProfile; works: ArteWork[]; cv: CvItem[]; texts: TextSet; program: Program }
export type SelectedWork = ArteWork;
export interface Dossier {
  sections: { letter: string; bio: string; statement: string; cv: CvItem[]; works: SelectedWork[] };
  limits: { images_max?: number; mb_max?: number; pages_max?: number; image_budget_bytes?: number };
  fileName: string;
}
export type Complete = (prompt: string, opts: { system?: string; maxTokens?: number }) => Promise<string | null>;

const DEFAULT_WORKS = 8;
const STOP = new Set("para con por los las del una uno que sus como sobre entre desde este esta artistas artista arte obra obras proyecto proyectos convocatoria".split(" "));
const words = (s: string) => new Set(s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().match(/[a-zñ]{4,}/g)?.filter((w) => !STOP.has(w)) ?? []);

/** Works ranked by word overlap with the call text; ties keep the artist's own order. */
function rankWorks(works: ArteWork[], p: Program): ArteWork[] {
  const call = words(`${p.name} ${p.description ?? ""} ${p.discipline ?? ""}`);
  const fit = (w: ArteWork) => [...words(`${w.title} ${w.technique ?? ""} ${w.series ?? ""} ${w.description ?? ""}`)].filter((x) => call.has(x) || [...call].some((c) => c.startsWith(x.slice(0, 5)))).length;
  return works.filter((w) => w.images.length).map((w) => ({ w, f: fit(w) })).sort((a, b) => b.f - a.f || a.w.sort - b.w.sort).map((x) => x.w);
}

export function dossierFileName(name: string, program: string) {
  const clean = (s: string) => s.replace(/[\\/]/g, "-").replace(/[:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
  return `${clean(name)} - postulación a ${clean(program)}.pdf`;
}

export function assembleDossier(ctx: DossierCtx, overrides: Partial<{ letter: string; bio: string; statement: string; workIds: string[] }> = {}): Dossier {
  const r = ctx.program.requirements || {};
  const n = r.images_n || DEFAULT_WORKS;
  const byId = new Map(ctx.works.map((w) => [w.id, w]));
  const works = overrides.workIds?.length ? overrides.workIds.map((id) => byId.get(id)).filter((w): w is ArteWork => !!w).slice(0, n) : rankWorks(ctx.works, ctx.program).slice(0, n);
  return {
    sections: {
      letter: overrides.letter ?? "",
      bio: overrides.bio ?? ctx.texts.bio_long?.es ?? ctx.texts.bio_short?.es ?? "",
      statement: overrides.statement ?? ctx.texts.statement?.es ?? "",
      cv: ctx.cv.filter((c) => c.confirmed),
      works,
    },
    limits: {
      images_max: r.images_n, mb_max: r.pdf_mb_max, pages_max: r.pdf_pages_max,
      // 5% kept for text, fonts and PDF overhead
      image_budget_bytes: r.pdf_mb_max ? Math.floor(r.pdf_mb_max * 1024 * 1024 * 0.95) : undefined,
    },
    fileName: dossierFileName(ctx.profile.name || "Artista", ctx.program.name),
  };
}

function templateLetter(ctx: DossierCtx): string {
  const p = ctx.program;
  const titles = rankWorks(ctx.works, p).slice(0, 2).map((w) => `“${w.title}”`);
  const statement = ctx.texts.statement?.es?.trim();
  const trayectoria = ctx.cv.filter((c) => c.confirmed && ["solo", "group", "prize", "residency", "grant"].includes(c.kind)).slice(0, 2)
    .map((c) => `${CV_KINDS.find(([k]) => k === c.kind)?.[1].toLowerCase()} en ${c.org || c.title}${c.year ? ` (${c.year})` : ""}`);
  return [
    `Estimado jurado de ${p.name}${p.organizer ? ` (${p.organizer})` : ""}:`,
    `Mi nombre es ${ctx.profile.name}${ctx.profile.base_city ? `, artista con base en ${ctx.profile.base_city}` : ""}, y me postulo a esta convocatoria porque su propuesta dialoga directamente con mi práctica.`,
    statement ? `${statement}` : "",
    titles.length ? `Para esta postulación presento, entre otras, ${titles.join(" y ")}, obras que condensan esa búsqueda.` : "",
    trayectoria.length ? `En los últimos años mi trabajo se desarrolló a través de ${trayectoria.join(" y ")}.` : "",
    `Participar de ${p.name} me permitiría profundizar esta línea de trabajo y ponerla en diálogo con nuevos interlocutores.`,
    `Quedo a disposición para ampliar cualquier información.`,
    `Saludos cordiales,\n${ctx.profile.name}`,
  ].filter(Boolean).join("\n\n");
}

/** First draft of the motivation letter: AI when available, otherwise a template built only from the artist's own data. */
export async function draftLetter(ctx: DossierCtx, complete: Complete): Promise<{ text: string; usedAI: boolean }> {
  const p = ctx.program;
  const titles = rankWorks(ctx.works, p).slice(0, 4).map((w) => `${w.title}${w.technique ? ` (${w.technique}, ${w.year ?? "s/f"})` : ""}`);
  const ai = await complete(
    [`Convocatoria: ${p.name}${p.organizer ? ` — ${p.organizer}` : ""}`, `Descripción: ${p.description ?? "—"}`, `Qué ofrece: ${p.benefit ?? "—"}`,
      `Artista: ${ctx.profile.name}, ${ctx.profile.base_city ?? ""}. Medios: ${ctx.profile.mediums.join(", ")}. Temas: ${ctx.profile.themes.join(", ")}.`,
      `Statement: ${ctx.texts.statement?.es ?? "—"}`, `Bio: ${ctx.texts.bio_long?.es ?? ctx.texts.bio_short?.es ?? "—"}`, `Obras elegidas: ${titles.join("; ")}`,
      `Trayectoria: ${ctx.cv.filter((c) => c.confirmed).slice(0, 8).map((c) => `${c.title} ${c.year ?? ""}`).join("; ")}`].join("\n"),
    { system: "Escribís cartas de motivación para convocatorias de arte en español rioplatense neutro y profesional. 250-350 palabras, primera persona, concretas, sin adjetivos grandilocuentes. Usá solo datos provistos; no inventes premios, exposiciones ni obras. Devolvé solo la carta.", maxTokens: 900 },
  );
  return ai ? { text: ai, usedAI: true } : { text: templateLetter(ctx), usedAI: false };
}
