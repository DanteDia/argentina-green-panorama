import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

// Runs against the local Supabase (scripts/arte-local-env.sh exports the connection).
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

async function userClient(email: string): Promise<{ client: SupabaseClient; id: string }> {
  const password = "test-password-123";
  const { data: list } = await admin.auth.admin.listUsers();
  let user = list.users.find((u) => u.email === email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    user = data.user!;
  }
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { client, id: user.id };
}

describe("arte RLS", () => {
  let a: { client: SupabaseClient; id: string };
  let b: { client: SupabaseClient; id: string };

  beforeAll(async () => {
    a = await userClient("rls-a@example.invalid");
    b = await userClient("rls-b@example.invalid");
    await admin.from("arte_works").delete().in("user_id", [a.id, b.id]);
  });

  it("a user cannot read another user's works", async () => {
    const ins = await a.client.from("arte_works").insert({ user_id: a.id, title: "Obra privada de A" });
    expect(ins.error).toBeNull();
    const { data } = await b.client.from("arte_works").select("id, title").eq("user_id", a.id);
    expect(data).toEqual([]);
  });

  it("a user cannot write rows owned by someone else", async () => {
    const ins = await b.client.from("arte_works").insert({ user_id: a.id, title: "Intruso" });
    expect(ins.error).not.toBeNull();
  });

  it("anonymous visitors can read programs but not write them", async () => {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    const read = await anon.from("arte_programs").select("id").limit(1);
    expect(read.error).toBeNull();
    const write = await anon.from("arte_programs").insert({ id: "x-test", name: "Falsa" });
    expect(write.error).not.toBeNull();
  });
});
