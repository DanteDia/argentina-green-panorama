import "server-only";
import { lookup } from "node:dns/promises";
import { isPublicAddress } from "./guards";

export interface Fetched { url: string; contentType: string; body: Buffer }
interface Opts { maxBytes: number; headers?: Record<string, string>; timeoutMs?: number; /** test hook only */ allowAddress?: (ip: string) => boolean }

/** Fetch a user-supplied URL: http(s) only, public IPs only (each redirect re-checked), body capped at maxBytes.
 *  Never throws: any failure (bad URL, blocked host, timeout, reset, oversize) returns null. */
export async function safeFetch(raw: string, opts: Opts): Promise<Fetched | null> {
  try {
    let url = raw;
    for (let hop = 0; hop < 4; hop++) {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      // ponytail: resolve-then-fetch leaves a DNS-rebinding window; pin the IP with a custom agent if this ever runs next to internal services
      const addrs = await lookup(u.hostname.replace(/^\[|\]$/g, ""), { all: true });
      if (!addrs.length || !addrs.every((a) => (opts.allowAddress ?? isPublicAddress)(a.address))) return null;
      const r = await fetch(u, { headers: opts.headers, redirect: "manual", signal: AbortSignal.timeout(opts.timeoutMs ?? 12000) });
      if (r.status >= 300 && r.status < 400) {
        const next = r.headers.get("location");
        await r.body?.cancel();
        if (!next) return null;
        url = new URL(next, u).href;
        continue;
      }
      if (!r.ok || !r.body || Number(r.headers.get("content-length") || 0) > opts.maxBytes) { await r.body?.cancel(); return null; }
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
  } catch {
    return null;
  }
}
