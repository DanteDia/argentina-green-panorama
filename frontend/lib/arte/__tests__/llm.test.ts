import { afterEach, describe, expect, it, vi } from "vitest";
import { complete } from "../llm";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("complete", () => {
  it("asks for a model that follows the provider's latest, with fallbacks, so a retired model id can't silently break drafts", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    let body: { model?: string; models?: string[] } = {};
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => { body = JSON.parse(init.body); return new Response(JSON.stringify({ choices: [{ message: { content: " hola " } }] })); }));
    expect(await complete("x")).toBe("hola");
    expect(body.model).toBeUndefined();
    expect(body.models!.length).toBeGreaterThanOrEqual(2);
    expect(body.models![0]).toMatch(/latest/);
  });

  it("logs why a call failed instead of failing silently", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"error":{"message":"No endpoints found for model"}}', { status: 404 })));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await complete("x")).toBeNull();
    expect(log.mock.calls.join(" ")).toMatch(/404.*No endpoints found/);
  });

  it("returns null without a key", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    expect(await complete("x")).toBeNull();
  });
});
