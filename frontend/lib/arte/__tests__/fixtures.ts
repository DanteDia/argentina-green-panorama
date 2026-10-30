import type { ArteProfile, Program } from "../types";

export const perfil = (o: Partial<ArteProfile> = {}): ArteProfile => ({
  user_id: "u", node_id: null, name: "Dante Arola", slug: "dante-arola", birth_year: 1993, birth_place: "Buenos Aires",
  base_city: "Buenos Aires", nationality: "AR", residence: "AR", website: null, instagram: null, email_public: null,
  mediums: ["instalación", "arte digital", "fotografía"], themes: ["identidad", "tecnología", "dato", "cuerpo"],
  career_stage: "emerging", monthly_budget: 2, portfolio_public: false, onboarded_at: null, ...o,
});

export const programa = (o: Partial<Program> = {}): Program => ({
  id: "p", name: "Programa", type: "Convocatoria", discipline: "Artes Visuales", organizer: "Org", country: "Argentina", url: "https://x",
  description: "Convocatoria abierta para artistas visuales.", benefit: null, eligibility: {}, requirements: {}, evidence: {},
  opens_at: null, closes_at: "2026-12-10", status: null, window_text: null, digital_focus: false, for_argentines: "sí",
  alumni_text: null, alumni_node_ids: [], source: "test", verified_at: "2026-10-30", ...o,
});
