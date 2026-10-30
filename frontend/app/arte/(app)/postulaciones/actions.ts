"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/arte/supabase-server";

/** Start an application for a program (idempotent per artist+program), then open it. */
export async function createApplication(programId: string) {
  const { user, supabase } = await requireUser();
  const { data: prog } = await supabase.from("arte_programs").select("closes_at").eq("id", programId).maybeSingle();
  const { data, error } = await supabase.from("arte_applications")
    .upsert({ user_id: user.id, program_id: programId, status: "preparing", due_at: prog?.closes_at ?? null }, { onConflict: "user_id,program_id", ignoreDuplicates: false })
    .select("id").single();
  if (error) throw new Error(error.message);
  revalidatePath("/arte", "layout");
  redirect(`/arte/postulaciones/${data.id}`);
}
