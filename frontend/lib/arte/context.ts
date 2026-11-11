import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Studio } from "./data";
import type { MatchContext } from "./match";
import type { ArteProfile, Program } from "./types";

const EMPTY_PROFILE = (userId: string): ArteProfile => ({
  user_id: userId, node_id: null, name: "", slug: null, birth_year: null, birth_place: null, base_city: null, nationality: "AR",
  residence: "AR", website: null, instagram: null, email_public: null, mediums: [], themes: [], career_stage: "emerging",
  monthly_budget: 2, portfolio_public: false, onboarded_at: null,
});

export async function loadPrograms(supabase: SupabaseClient): Promise<Program[]> {
  const { data } = await supabase.from("arte_programs").select("*").limit(2000);
  return (data as Program[]) || [];
}

/** The artist's place in the scene map: artists who share their galleries/venues/programs (two hops through shared
 *  targets), and the names of the spaces they are linked to or follow. */
export async function sceneOf(supabase: SupabaseClient, userId: string, nodeId: string | null): Promise<{ similar: Set<string>; names: Set<string> }> {
  const [{ data: mine }, { data: follows }] = await Promise.all([
    nodeId ? supabase.from("edges").select("target_id").eq("source_id", nodeId).limit(200) : Promise.resolve({ data: [] as { target_id: string }[] }),
    supabase.from("arte_follows").select("node_id").eq("user_id", userId).not("node_id", "is", null).limit(600),
  ]);
  const targets = (mine || []).map((e) => e.target_id);
  const known = [...new Set([...targets, ...(follows || []).map((f) => f.node_id as string)])].slice(0, 600);
  const [{ data: peers }, { data: nodes }] = await Promise.all([
    targets.length && nodeId ? supabase.from("edges").select("source_id").in("target_id", targets).neq("source_id", nodeId).limit(2000) : Promise.resolve({ data: [] as { source_id: string }[] }),
    // artists are people, not organisers: only spaces can run a call
    known.length ? supabase.from("nodes").select("nombre").in("id", known).neq("categoria", "artista").limit(600) : Promise.resolve({ data: [] as { nombre: string }[] }),
  ]);
  return { similar: new Set((peers || []).map((e) => e.source_id)), names: new Set((nodes || []).map((n) => n.nombre).filter(Boolean)) };
}

export async function buildMatchContext(supabase: SupabaseClient, userId: string, studio: Studio, now = new Date()): Promise<MatchContext> {
  const [{ data: apps }, scene] = await Promise.all([
    supabase.from("arte_applications").select("program_id").eq("user_id", userId),
    sceneOf(supabase, userId, studio.profile?.node_id ?? null),
  ]);
  return {
    profile: studio.profile ?? EMPTY_PROFILE(userId),
    works: studio.works,
    cv: studio.cv,
    // what the work is about, in both languages (calls are often in English). Bios list where you studied, not your themes
    statement: [studio.texts.statement?.es, studio.texts.statement?.en].filter(Boolean).join(" "),
    appliedProgramIds: new Set((apps || []).map((a) => a.program_id)),
    similarArtistNodeIds: scene.similar,
    sceneNames: scene.names,
    now,
  };
}
