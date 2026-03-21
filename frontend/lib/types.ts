// Verification types
export type VerificationStatus = "unverified" | "pending" | "accepted" | "finalized" | "failed";

export interface VerificationResult {
  exists: boolean;
  argentina_related: boolean;
  green_sector: boolean;
  description_accurate: boolean;
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
  source: "manual" | "agent";
}

export interface GreenEdge {
  id: string;
  source_id: string;
  target_id: string;
  relationship_type: "funds" | "partners_with" | "client_of" | "portfolio" | "regulates";
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
  "Empresa Privada": "#3b82f6",
  "ONG": "#f59e0b",
  "Fondo Verde": "#22c55e",
  "Aceleradora": "#8b5cf6",
  "Government": "#ef4444",
  "Organismo Internacional": "#06b6d4",
  "Consultora": "#ec4899",
  "Startup": "#84cc16",
};

// Edge colors by type
export const EDGE_COLORS: Record<string, string> = {
  funds: "#22c55e",
  partners_with: "#3b82f6",
  client_of: "#f59e0b",
  portfolio: "#8b5cf6",
  regulates: "#ef4444",
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
