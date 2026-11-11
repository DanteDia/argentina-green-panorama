"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/arte/supabase-server";
import { contactOf, inviteKey } from "@/lib/arte/invite";

const txt = (v: FormDataEntryValue | null) => (String(v ?? "").trim() || null);

export async function saveShow(form: FormData) {
  const { user, supabase } = await requireUser();
  const id = txt(form.get("id"));
  const row = {
    user_id: user.id, title: txt(form.get("title")) ?? "Mi muestra", venue: txt(form.get("venue")), address: txt(form.get("address")),
    when_text: txt(form.get("when_text")), link: txt(form.get("link")), note: txt(form.get("note")),
  };
  const q = id ? supabase.from("arte_shows").update(row).eq("id", id).select("id").single() : supabase.from("arte_shows").insert(row).select("id").single();
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  revalidatePath("/arte/invitar");
  redirect(`/arte/invitar?muestra=${data.id}`);
}

/** Records that the artist sent this invitation (they send it themselves from Gmail / Instagram). */
export async function markInvited(showId: string, guest: { nodeId?: string | null; name: string; email?: string | null; instagram?: string | null }) {
  const { user, supabase } = await requireUser();
  const c = contactOf({ email: guest.email, instagram: guest.instagram });
  const key = inviteKey({ nodeId: guest.nodeId, email: c.email, instagram: c.instagram });
  const { error } = await supabase.from("arte_invites").upsert(
    { user_id: user.id, show_id: showId, key, node_id: guest.nodeId ?? null, name: guest.name.slice(0, 200), email: c.email, instagram: c.instagram },
    { onConflict: "show_id,key", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
  revalidatePath("/arte/invitar");
}

export async function unmarkInvited(inviteId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("arte_invites").delete().eq("id", inviteId);
  if (error) throw new Error(error.message);
  revalidatePath("/arte/invitar");
}
