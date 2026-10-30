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

/** Artists close to this artist in the graph: same galleries/venues/programs (two hops through shared targets). */
export async function similarArtists(supabase: SupabaseClient, nodeId: string | null): Promise<Set<string>> {
  if (!nodeId) return new Set();
  const { data: mine } = await supabase.from("edges").select("target_id").eq("source_id", nodeId).limit(200);
  const targets = (mine || []).map((e) => e.target_id);
  if (!targets.length) return new Set();
  const { data: peers } = await supabase.from("edges").select("source_id").in("target_id", targets).neq("source_id", nodeId).limit(2000);
  return new Set((peers || []).map((e) => e.source_id));
}

export async function buildMatchContext(supabase: SupabaseClient, userId: string, studio: Studio, now = new Date()): Promise<MatchContext> {
  const [{ data: apps }, similar] = await Promise.all([
    supabase.from("arte_applications").select("program_id").eq("user_id", userId),
    similarArtists(supabase, studio.profile?.node_id ?? null),
  ]);
  return {
    profile: studio.profile ?? EMPTY_PROFILE(userId),
    works: studio.works,
    cv: studio.cv,
    statement: [studio.texts.statement?.es, studio.texts.bio_long?.es, studio.texts.bio_short?.es].filter(Boolean).join(" "),
    appliedProgramIds: new Set((apps || []).map((a) => a.program_id)),
    similarArtistNodeIds: similar,
    now,
  };
}
