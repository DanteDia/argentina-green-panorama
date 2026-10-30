import "server-only";
import { lookup } from "node:dns/promises";
import { isPublicAddress } from "./guards";

export interface Fetched { url: string; contentType: string; body: Buffer }

/** Fetch a user-supplied URL: http(s) only, public IPs only (each redirect re-checked), body capped at maxBytes. */
export async function safeFetch(raw: string, opts: { maxBytes: number; headers?: Record<string, string>; timeoutMs?: number }): Promise<Fetched | null> {
  let url = raw;
  for (let hop = 0; hop < 4; hop++) {
    let u: URL;
    try { u = new URL(url); } catch { return null; }
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    // ponytail: resolve-then-fetch leaves a DNS-rebinding window; pin the IP with a custom agent if this ever runs next to internal services
    const addrs = await lookup(u.hostname.replace(/^\[|\]$/g, ""), { all: true }).catch(() => []);
    if (!addrs.length || !addrs.every((a) => isPublicAddress(a.address))) return null;
    const r = await fetch(u, { headers: opts.headers, redirect: "manual", signal: AbortSignal.timeout(opts.timeoutMs ?? 12000) }).catch(() => null);
    if (!r) return null;
    if (r.status >= 300 && r.status < 400) {
      const next = r.headers.get("location");
      if (!next) return null;
      url = new URL(next, u).href;
      continue;
    }
    if (!r.ok || !r.body) return null;
    if (Number(r.headers.get("content-length") || 0) > opts.maxBytes) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = r.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > opts.maxBytes) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    return { url: u.href, contentType: r.headers.get("content-type") || "", body: Buffer.concat(chunks) };
  }
  return null;
}
