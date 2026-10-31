"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/arte/supabase-server";
import { loadStudio } from "@/lib/arte/data";
import { completeness } from "@/lib/arte/completeness";
import { buildChecklist } from "@/lib/arte/checklist";
import type { AppStatus, Program } from "@/lib/arte/types";

const minusDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") - n * 86_400_000).toISOString().slice(0, 10);

/** Start an application (idempotent per artist+program) with a checklist built from the call's requirements. */
export async function createApplication(programId: string) {
  const { user, supabase } = await requireUser();
  const { data: prog } = await supabase.from("arte_programs").select("*").eq("id", programId).maybeSingle();
  if (!prog) throw new Error("No existe esa convocatoria");
  const { data: existing } = await supabase.from("arte_applications").select("id").eq("user_id", user.id).eq("program_id", programId).maybeSingle();
  if (existing) redirect(`/arte/postulaciones/${existing.id}`);
  const { data, error } = await supabase.from("arte_applications")
    .insert({ user_id: user.id, program_id: programId, status: "preparing", due_at: (prog as Program).closes_at ?? null }).select("id").single();
  if (error) throw new Error(error.message);
  const studio = await loadStudio(supabase, user.id);
  const gaps = completeness(studio.profile ?? ({ name: "", mediums: [], themes: [] } as never), studio.works, studio.cv, studio.texts).missing
    .filter((m) => /statement|bio|obras|fichas/.test(m));
  const items = buildChecklist((prog as Program).requirements || {}, gaps);
  await supabase.from("arte_application_items").insert(items.map((it, i) => ({
    user_id: user.id, application_id: data.id, key: it.key, label: it.label, sort: i,
    due_at: (prog as Program).closes_at ? minusDays((prog as Program).closes_at!, it.due_offset_days) : null,
  })));
  revalidatePath("/arte", "layout");
  redirect(`/arte/postulaciones/${data.id}`);
}

export async function toggleItem(id: string, done: boolean) {
  const { supabase } = await requireUser();
  await supabase.from("arte_application_items").update({ done }).eq("id", id);
  revalidatePath("/arte/postulaciones");
}

export async function saveNotes(id: string, notes: string) {
  const { supabase } = await requireUser();
  await supabase.from("arte_applications").update({ notes, updated_at: new Date().toISOString() }).eq("id", id);
}

/** Status change; being selected adds the program to the CV automatically. */
export async function setStatus(id: string, status: AppStatus) {
  const { user, supabase } = await requireUser();
  const { data: app } = await supabase.from("arte_applications").select("program_id, status, arte_programs(name, organizer, type, country)").eq("id", id).single();
  await supabase.from("arte_applications").update({ status, result_at: ["selected", "rejected"].includes(status) ? new Date().toISOString().slice(0, 10) : null, updated_at: new Date().toISOString() }).eq("id", id);
  if (status === "selected" && app && app.status !== "selected") {
    const p = app.arte_programs as unknown as { name: string; organizer: string | null; type: string | null; country: string | null };
    const t = (p.type || "").toLowerCase();
    const kind = t.includes("resid") ? "residency" : t.includes("beca") ? "grant" : t.includes("premio") ? "prize" : "group";
    await supabase.from("arte_cv_items").insert({ user_id: user.id, kind, title: p.name, org: p.organizer, country: p.country, year: String(new Date().getFullYear()), source: "application", confirmed: true });
  }
  revalidatePath("/arte", "layout");
}

export async function deleteApplication(id: string) {
  const { supabase } = await requireUser();
  await supabase.from("arte_applications").delete().eq("id", id);
  revalidatePath("/arte", "layout");
  redirect("/arte/postulaciones");
}
