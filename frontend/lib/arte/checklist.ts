import type { ChecklistItem, Requirements } from "./types";

/** Concrete steps for one application, ordered by how many days before the deadline each should be done. */
export function buildChecklist(req: Requirements, profileGaps: string[]): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const add = (key: string, label: string, due_offset_days: number) => items.push({ key, label, done: false, due_offset_days });
  for (const gap of profileGaps.slice(0, 2)) add(`gap:${gap}`, `Completar perfil: ${gap}`, 12);
  add("bases", "Leer las bases oficiales", 14);
  if (req.project) add("project", "Proyecto", 10);
  if (req.budget) add("budget", "Presupuesto", 7);
  if (req.video) add("video", "Video", 7);
  if (req.statement) add("statement", "Statement", 5);
  if (req.images_n) add("works", `Seleccionar ${req.images_n} obras con ficha`, 5);
  else if (req.portfolio) add("portfolio", "Armar portfolio / dossier", 5);
  if (req.letter) add("letter", "Carta de motivación", 4);
  if (req.bio) add("bio", "Biografía", 3);
  if (req.cv) add("cv", "CV", 2);
  if (req.fee) add("fee", `Pagar inscripción (${req.fee.amount} ${req.fee.currency})`, 1);
  add("export", "Exportar el dossier y revisarlo", 1);
  add("send", "Enviar postulación", 0);
  const gaps = items.filter((i) => i.key.startsWith("gap:"));
  const rest = items.filter((i) => !i.key.startsWith("gap:")).sort((a, b) => b.due_offset_days - a.due_offset_days);
  return [...gaps, ...rest];
}

/** Where a checklist step gets done: the profile for gaps, the official rules, the dossier for what goes in the PDF. Null = outside the app. */
export function checklistHref(key: string, applicationId: string, programUrl: string | null): string | null {
  if (key.startsWith("gap:")) return /obras|fichas|im[aá]genes/.test(key) ? "/arte/perfil/obras" : "/arte/perfil#textos";
  if (key === "bases") return programUrl && /^https?:\/\//i.test(programUrl) ? programUrl : null;   // synced data: only real web links become an href
  if (key === "cv") return "/arte/perfil/cv";
  if (["letter", "works", "portfolio", "export", "statement", "bio"].includes(key)) return `/arte/postulaciones/${applicationId}/dossier`;
  return null;
}
