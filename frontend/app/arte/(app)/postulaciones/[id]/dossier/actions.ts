"use server";
import { requireUser } from "@/lib/arte/supabase-server";
import { loadStudio } from "@/lib/arte/data";
import { draftLetter } from "@/lib/arte/dossier";
import { complete } from "@/lib/arte/llm";
import type { Program } from "@/lib/arte/types";

export interface DossierDraft { letter: string; bio: string; statement: string; workIds: string[]; template: "editorial" | "minimal" }

export async function saveDossier(applicationId: string, d: DossierDraft) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("arte_applications").update({ dossier: d, updated_at: new Date().toISOString() }).eq("id", applicationId);
  if (error) throw new Error(error.message);
}

export async function regenerateLetter(applicationId: string): Promise<{ text: string; usedAI: boolean }> {
  const { user, supabase } = await requireUser();
  const { data: app } = await supabase.from("arte_applications").select("arte_programs(*)").eq("id", applicationId).single();
  const studio = await loadStudio(supabase, user.id);
  if (!studio.profile || !app) throw new Error("Completá tu perfil primero");
  return draftLetter({ profile: studio.profile, works: studio.works, cv: studio.cv, texts: studio.texts, program: app.arte_programs as unknown as Program }, complete);
}
