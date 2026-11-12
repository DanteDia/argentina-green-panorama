import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { complete } from "../llm";

// the SDK is replaced by a stub that records the request and answers what each test sets
const claude = vi.hoisted(() => ({ create: vi.fn(), options: {} as Record<string, unknown> }));
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error { status: number | undefined; constructor(status: number | undefined, message: string) { super(message); this.status = status; } }
  class Anthropic { static APIError = APIError; beta = { messages: { create: claude.create } }; constructor(o: Record<string, unknown>) { claude.options = o; } }
  return { default: Anthropic };
});

beforeEach(() => { vi.stubEnv("ANTHROPIC_API_KEY", ""); claude.create.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("complete with an Anthropic key", () => {
  it("asks Claude through the SDK and never calls the other provider", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    vi.stubEnv("OPENROUTER_API_KEY", "old");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    claude.create.mockResolvedValue({ model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "thinking", thinking: "" }, { type: "text", text: " hola " }] });
    expect(await complete("x", { system: "s", maxTokens: 700 })).toBe("hola");
    const req = claude.create.mock.calls[0][0];
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.system).toBe("s");
    expect(req.messages).toEqual([{ role: "user", content: "x" }]);
    // this model always thinks before answering and that is billed against max_tokens: leave room on top of the text budget
    expect(req.max_tokens).toBeGreaterThanOrEqual(700 + 1500);
    expect(req.temperature).toBeUndefined();   // rejected by this model
    // the model's default effort is higher: without "low" a long draft does not fit the time limit
    expect(req.output_config).toEqual({ effort: "low" });
    expect(req.fallbacks).toBe("default");
    expect(req.betas).toContain("server-side-fallback-2026-07-01");
    expect(fetchSpy).not.toHaveBeenCalled();
    // a draft runs inside a serverless function with a time limit: one attempt, bounded
    expect(claude.options.maxRetries).toBe(0);
    expect(claude.options.timeout).toBeLessThanOrEqual(50_000);
  });

  it("logs why a call failed and returns null, so the caller falls back to its non-AI text", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    claude.create.mockRejectedValue(new (Anthropic.APIError as unknown as new (s: number, m: string) => Error)(401, "invalid x-api-key"));
    expect(await complete("x")).toBeNull();
    expect(log.mock.calls.join(" ")).toMatch(/401.*invalid x-api-key/);
  });

  it("logs an answer without text: declined, or the budget spent before any text", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    claude.create.mockResolvedValue({ model: "claude-opus-5-5", stop_reason: "refusal", content: [] });
    expect(await complete("x")).toBeNull();
    expect(log.mock.calls.join(" ")).toMatch(/refusal/);
  });

  it("never hands a declined answer to the artist as their draft, even when it carries text", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    vi.spyOn(console, "error").mockImplementation(() => {});
    claude.create.mockResolvedValue({ model: "claude-opus-5-5", stop_reason: "refusal", content: [{ type: "text", text: "No puedo ayudar con eso." }] });
    expect(await complete("x")).toBeNull();
  });

  it("logs a request that got no response (a timeout has no status)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    claude.create.mockRejectedValue(new (Anthropic.APIError as unknown as new (s: number | undefined, m: string) => Error)(undefined, "Request timed out."));
    expect(await complete("x")).toBeNull();
    expect(log.mock.calls.join(" ")).toMatch(/Claude no response: Request timed out/);
  });
});

describe("complete", () => {
  it("asks for a model that follows the provider's latest, with fallbacks, so a retired model id can't silently break drafts", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    let body: { model?: string; models?: string[]; max_tokens?: number; reasoning?: { effort?: string } } = {};
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => { body = JSON.parse(init.body); return new Response(JSON.stringify({ choices: [{ message: { content: " hola " } }] })); }));
    expect(await complete("x", { maxTokens: 700 })).toBe("hola");
    // these models think before answering and that thinking is billed against max_tokens: keep it short and leave room for the text
    expect(body.reasoning?.effort).toBe("low");
    expect(body.max_tokens).toBeGreaterThanOrEqual(700 + 1500);
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

  it("logs a 200 that carries no text: an error object, or a budget spent before the answer", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "Provider returned error" } }))));
    expect(await complete("x")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "" } }] }))));
    expect(await complete("x")).toBeNull();
    expect(log.mock.calls.join(" ")).toMatch(/Provider returned error/);
    expect(log.mock.calls.join(" ")).toMatch(/length/);
  });

  it("returns null without a key", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    expect(await complete("x")).toBeNull();
  });
});
