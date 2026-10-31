// Domain types for the Arte career tool. Mirrors supabase/migrations/*_arte.sql.

export type CareerStage = "emerging" | "mid" | "established";
export type CvKind = "education" | "solo" | "group" | "prize" | "grant" | "residency" | "collection" | "press";
export type AppStatus = "idea" | "preparing" | "sent" | "selected" | "rejected" | "withdrawn";
export type TextKind = "bio_short" | "bio_long" | "statement" | "letter";
export type Lang = "es" | "en";

export interface ArteProfile {
  user_id: string;
  node_id: string | null;
  name: string;
  slug: string | null;
  birth_year: number | null;
  birth_place: string | null;
  base_city: string | null;
  nationality: string | null; // ISO-2, default 'AR'
  residence: string | null; // ISO-2, default 'AR'
  website: string | null;
  instagram: string | null;
  email_public: string | null;
  mediums: string[];
  themes: string[];
  career_stage: CareerStage;
  monthly_budget: number;
  portfolio_public: boolean;
  onboarded_at: string | null;
}

export interface ArteWork {
  id: string;
  user_id: string;
  title: string;
  year: string | null;
  technique: string | null;
  dimensions: string | null;
  series: string | null;
  description: string | null;
  images: string[];
  sort: number;
  public: boolean;
  source?: string;
}

export interface CvItem {
  id: string;
  user_id: string;
  kind: CvKind;
  title: string;
  org: string | null;
  city: string | null;
  country: string | null;
  year: string | null;
  link: string | null;
  source: "manual" | "import" | "graph" | "application";
  confirmed: boolean;
}

export interface ArteText {
  id: string;
  user_id: string;
  kind: TextKind;
  lang: Lang;
  body: string;
  application_id: string | null;
  version: number;
}

/** Texts keyed for quick access: texts.statement.es, texts.bio_short.en ... */
export type TextSet = Partial<Record<Exclude<TextKind, "letter">, Partial<Record<Lang, string>>>>;

export interface Eligibility {
  nationality?: string[]; // ISO-2 allowed nationalities; empty/undefined = any
  residence?: string[];
  age_min?: number;
  age_max?: number;
  disciplines?: string[];
  career_stage?: CareerStage[];
}

export interface Requirements {
  letter?: boolean;
  cv?: boolean;
  bio?: boolean;
  statement?: boolean;
  portfolio?: boolean;
  images_n?: number;
  pdf_pages_max?: number;
  pdf_mb_max?: number;
  video?: boolean;
  budget?: boolean;
  project?: boolean;
  fee?: { amount: number; currency: string } | null;
}

export interface Program {
  id: string;
  name: string;
  type: string | null;
  discipline: string | null;
  organizer: string | null;
  country: string | null;
  url: string | null;
  description: string | null;
  benefit: string | null;
  eligibility: Eligibility;
  requirements: Requirements;
  evidence: Record<string, string>;
  opens_at: string | null; // YYYY-MM-DD
  closes_at: string | null; // YYYY-MM-DD
  status: string | null;
  window_text: string | null;
  digital_focus: boolean;
  for_argentines: string | null;
  alumni_text: string | null;
  alumni_node_ids: string[];
  source: string | null;
  verified_at: string | null;
}

export interface Application {
  id: string;
  user_id: string;
  program_id: string;
  status: AppStatus;
  due_at: string | null;
  notes: string;
  dossier: Record<string, unknown>;
  result: string | null;
  result_at: string | null;
}

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  due_offset_days: number; // days before the deadline it should be done
}

export interface ArteEvent {
  id: string;
  title: string;
  venue_node_id: string | null;
  venue_name: string | null;
  starts_on: string | null;
  ends_on: string | null;
  url: string | null;
  image_url: string | null;
  artists: string[];
  source: string | null;
}
