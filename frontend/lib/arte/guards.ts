import { BlockList, isIP } from "node:net";
import type { ArteProfile } from "./types";

const blocked = new BlockList();
for (const [net, bits] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3]] as const)
  blocked.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [["::", 127], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const) blocked.addSubnet(net, bits, "ipv6");

/** True only for routable public IPs: server-side fetches of user URLs must never reach internal networks. */
export function isPublicAddress(ip: string): boolean {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  const addr = mapped ?? ip;
  const v = isIP(addr);
  if (!v) return false;
  return !blocked.check(addr, v === 4 ? "ipv4" : "ipv6");
}

/** Storage paths a user may reference: only their own folder. */
export const ownPaths = (paths: string[], userId: string) => paths.filter((p) => p.startsWith(`${userId}/`) && !p.includes(".."));

export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

const PROFILE_FIELDS = ["name", "birth_year", "birth_place", "base_city", "website", "instagram", "email_public", "mediums", "themes", "node_id"] as const;
const empty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/** Profile fields to save from an import draft: the artist's existing values win, the draft only fills blanks
 *  and adds to lists, so re-running onboarding never overwrites what they curated. */
export function mergeProfile(existing: ArteProfile | null, draft: Partial<ArteProfile>): Partial<ArteProfile> {
  const out: Record<string, unknown> = {};
  for (const k of PROFILE_FIELDS) {
    const have = existing?.[k];
    if (k === "mediums" || k === "themes") out[k] = [...new Set([...((have as string[]) ?? []), ...((draft[k] as string[]) ?? [])])];
    else out[k] = !empty(have) ? have : empty(draft[k]) ? null : draft[k];
  }
  return out as Partial<ArteProfile>;
}
