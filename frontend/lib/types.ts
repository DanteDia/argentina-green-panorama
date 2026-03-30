// Verification types
export type VerificationStatus = "unverified" | "pending" | "accepted" | "finalized" | "failed";

export interface VerificationResult {
  exists: boolean;
  geography_relevant: boolean;
  sector_relevant: boolean;
  description_accurate: boolean;
  funding_accurate: boolean;
  verified_funders: string[];
  accuracy_score: "high" | "medium" | "low";
  reasoning: string;
}

export interface SocialPlatformResult {
  link_valid: boolean;
  belongs_to_company: boolean;
  is_real_account: boolean;
  estimated_followers: string;
  follower_match: boolean;
  activity_level: "active" | "dormant" | "dead";
  last_post_estimate: string;
}

export interface SocialAuditResult {
  platforms: Record<string, SocialPlatformResult>;
  overall_social_score: "high" | "medium" | "low";
  reasoning: string;
}

export interface NodeVerificationState {
  status: VerificationStatus;
  txHash?: string;
  result?: VerificationResult;
  socialResult?: SocialAuditResult;
  socialTxHash?: string;
  socialStatus?: VerificationStatus;
}

export interface GreenNode {
  id: string;
  nombre: string;
  link: string | null;
  followers: number | null;
  cluster: string;
  categoria: string;
  quien_fondea: string;
  aliados_portfolio: string[];
  clientes: string[];
  descripcion: string;
  logo_url?: string | null;
  verified: boolean;
  verification_tx: string | null;
  verification_attempts?: number;
  verification_status?: "unverified" | "pending" | "verified" | "failed" | "grey";
  verification_failure_reason?: string | null;
  verification_details?: {
    exists?: boolean;
    sector_relevant?: boolean;
    description_accurate?: boolean;
    geography_relevant?: boolean;
    funding_accurate?: boolean;
    verified_funders?: string[];
    relationships?: Record<string, boolean>;
    social?: Record<string, boolean>;
  };
  source: "manual" | "agent";
  // Event-specific fields
  is_participant?: boolean;
  event_role?: string;
  event_sponsor_tier?: string;
}

export interface GreenEdge {
  id: string;
  source_id: string;
  target_id: string;
  relationship_type: "funds" | "partners_with" | "client_of" | "portfolio" | "regulates" | "sponsors" | "competes_with" | "ecosystem" | "invested_in" | "built_on";
  description: string;
  confidence: number;
  source: string;
}

export interface GraphData {
  nodes: GreenNode[];
  edges: GreenEdge[];
}

export interface GraphStats {
  total_nodes: number;
  total_edges: number;
  verified_nodes: number;
  cluster_counts: Record<string, number>;
}

// Cluster colors
export const CLUSTER_COLORS: Record<string, string> = {
  "Empresa Privada": "#5b8fd9",
  "ONG": "#d4915a",
  "Fondo Verde": "#3a9d6e",
  "Aceleradora": "#8b7ec8",
  "Government": "#c75f5f",
  "Gobierno": "#c75f5f",
  "Organismo Internacional": "#5db8b8",
  "Consultora": "#c47ea0",
  "Startup": "#7fb848",
};

// Edge colors by type
export const EDGE_COLORS: Record<string, string> = {
  funds: "#3a9d6e",
  partners_with: "#5b8fd9",
  client_of: "#d4915a",
  portfolio: "#8b7ec8",
  regulates: "#c75f5f",
};

// Edge labels
export const EDGE_LABELS: Record<string, string> = {
  funds: "Fondea",
  partners_with: "Aliado",
  client_of: "Cliente",
  portfolio: "Portfolio",
  regulates: "Regula",
};

export const CLUSTER_LABELS_ES: Record<string, string> = {
  "Empresa Privada": "Empresa Privada",
  "ONG": "ONG",
  "Fondo Verde": "Fondo Verde",
  "Aceleradora": "Aceleradora",
  "Government": "Gobierno",
  "Organismo Internacional": "Organismo Internacional",
  "Consultora": "Consultora",
  "Startup": "Startup",
};

export const CLUSTER_LABELS_EN: Record<string, string> = {
  "Empresa Privada": "Private Company",
  "ONG": "NGO",
  "Fondo Verde": "Green Fund",
  "Aceleradora": "Accelerator",
  "Government": "Government",
  "Organismo Internacional": "International Org",
  "Consultora": "Consulting",
  "Startup": "Startup",
};
