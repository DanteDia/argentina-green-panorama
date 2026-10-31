import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { safeFetch } from "../safe-fetch";

let server: http.Server;
let base = "";
beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/bad-redirect") { res.writeHead(302, { location: "http://[" }); res.end(); return; }
    if (req.url === "/stall") { res.writeHead(200, { "content-type": "text/html" }); res.write("<p>start"); return; } // never ends
    res.writeHead(200, { "content-type": "text/html" }); res.end("<p>ok</p>");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.closeAllConnections(); server.close(); });

// Loopback is allowed only through the test hook; production calls never pass it.
const opts = { maxBytes: 1024, timeoutMs: 400, allowAddress: () => true };

describe("safeFetch", () => {
  it("blocks loopback by default", async () => {
    expect(await safeFetch(`${base}/`, { maxBytes: 1024 })).toBeNull();
  });
  it("returns the body for a normal page", async () => {
    expect((await safeFetch(`${base}/`, opts))?.body.toString()).toBe("<p>ok</p>");
  });
  it("returns null (never throws) on a malformed redirect", async () => {
    await expect(safeFetch(`${base}/bad-redirect`, opts)).resolves.toBeNull();
  });
  it("returns null (never throws) when the body stalls past the timeout", async () => {
    await expect(safeFetch(`${base}/stall`, opts)).resolves.toBeNull();
  });
});
