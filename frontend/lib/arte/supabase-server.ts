import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ArteProfile } from "./types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** Supabase client bound to the visitor's session cookies (RLS applies as that user). */
export async function createServerSupabase(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(URL, ANON, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // called from a Server Component: the proxy refreshes the session instead
        }
      },
    },
  });
}

/** Service-role client for trusted server code only (sync, admin jobs). Never import from client code. */
export function createAdminSupabase(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(URL, key, { auth: { persistSession: false } });
}

/** Signed-in user + their profile; redirects to the login page when there is no session. */
export async function requireUser(): Promise<{ user: User; profile: ArteProfile | null; supabase: SupabaseClient }> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/arte/login");
  const { data: profile } = await supabase.from("arte_profiles").select("*").eq("user_id", data.user.id).maybeSingle();
  return { user: data.user, profile: (profile as ArteProfile) ?? null, supabase };
}
