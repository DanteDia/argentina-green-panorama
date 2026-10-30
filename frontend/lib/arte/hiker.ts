import "server-only";
import type { IgProfile } from "./import-map";

const BASE = "https://api.hikerapi.com";

async function hiker<T>(path: string, params: Record<string, string>): Promise<T | { error: string }> {
  const key = process.env.HIKERAPI_KEY;
  if (!key) return { error: "Instagram no configurado en este entorno" };
  try {
    const r = await fetch(`${BASE}${path}?${new URLSearchParams(params)}`, { headers: { "x-access-key": key }, cache: "no-store", signal: AbortSignal.timeout(20000) });
    if (r.status === 404) return { error: "no existe esa cuenta" };
    if (!r.ok) return { error: `Instagram respondió ${r.status}` };
    return (await r.json()) as T;
  } catch {
    return { error: "Instagram no respondió" };
  }
}

export async function fetchIgProfile(handle: string): Promise<IgProfile | { error: string }> {
  const h = handle.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").split(/[/?]/)[0];
  if (!/^[A-Za-z0-9._]{1,30}$/.test(h)) return { error: "usuario inválido" };
  const d = await hiker<IgProfile & { is_private?: boolean }>("/v1/user/by/username", { username: h });
  if ("error" in d) return d;
  if (!d.username) return { error: "no existe esa cuenta" };
  return d;
}

/** Accounts the artist follows (seed for Discovery). Two requests per page; capped. */
export async function fetchIgFollowing(userId: string, max = 600): Promise<{ username: string; full_name?: string }[]> {
  const out: { username: string; full_name?: string }[] = [];
  let cursor = "";
  for (let i = 0; i < 20 && out.length < max; i++) {
    const params: Record<string, string> = { user_id: userId, force: "on" };
    if (cursor) params.end_cursor = cursor;
    const d = await hiker<[{ username: string; full_name?: string }[], string | null]>("/gql/user/following/chunk", params);
    if ("error" in d || !Array.isArray(d)) break;
    out.push(...(d[0] || []).map((u) => ({ username: u.username, full_name: u.full_name })));
    if (!d[1]) break;
    cursor = d[1];
  }
  return out.slice(0, max);
}
