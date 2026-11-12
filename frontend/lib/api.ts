import { GraphData, GraphStats } from "./types";

// Use relative URL for Next.js API routes (works on Vercel without a separate backend)
// Falls back to external backend URL if set
const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export async function fetchGraph(industries?: string[], max?: number, types?: string[]): Promise<GraphData> {
  const params = new URLSearchParams();
  if (industries && industries.length > 0) params.set("industries", industries.join(","));
  if (max) params.set("max", String(max));
  if (types && types.length > 0) params.set("types", types.join(","));
  const s = params.toString();   // not params.size: Safari before 17 lacks it
  const qs = s ? `?${s}` : "";
  const res = await fetch(`${API_URL}/api/graph${qs}`);
  if (!res.ok) throw new Error("Failed to fetch graph");
  return res.json();
}

export async function fetchStats(): Promise<GraphStats> {
  const res = await fetch(`${API_URL}/api/stats`);
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}
