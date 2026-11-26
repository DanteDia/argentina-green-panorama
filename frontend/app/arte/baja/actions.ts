"use server";
import { redirect } from "next/navigation";
import { createAdminSupabase } from "@/lib/arte/supabase-server";
import { validUnsubscribe } from "@/lib/arte/digest";

const signing = () => process.env.SUPABASE_JWT_SECRET || "";   // the same secret the mail signs with

export async function setDigest(form: FormData) {
  const u = String(form.get("u") || ""), t = String(form.get("t") || ""), off = form.get("off") === "1";
  if (!signing() || !validUnsubscribe(u, t, signing())) redirect("/arte/baja?error=1");
  await createAdminSupabase().from("arte_profiles").update({ digest_opt_out: off }).eq("user_id", u);
  redirect(`/arte/baja?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}&listo=${off ? "baja" : "alta"}`);
}
