import { GraphData, GraphStats } from "./types";

// Use relative URL for Next.js API routes (works on Vercel without a separate backend)
// Falls back to external backend URL if set
const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export async function fetchGraph(): Promise<GraphData> {
  const res = await fetch(`${API_URL}/api/graph`);
  if (!res.ok) throw new Error("Failed to fetch graph");
  return res.json();
}

export async function fetchStats(): Promise<GraphStats> {
  const res = await fetch(`${API_URL}/api/stats`);
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}
