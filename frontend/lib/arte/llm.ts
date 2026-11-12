// Server-side only. With ANTHROPIC_API_KEY the drafts are written by Claude through the official SDK; without it they go
// to OpenRouter (OPENROUTER_API_KEY) as before. Returns null when there is no key or the call fails, so every caller has
// a non-AI fallback.
//
import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// The request below is written for Claude Opus 5.5 (effort, server-side fallback, no temperature): a model named here
// has to accept the same parameters, or every draft comes back null with a 400 in the logs.
const CLAUDE_MODEL = process.env.ARTE_CLAUDE_MODEL || "claude-opus-5-5";

// Model ids get retired: the previous hard-coded one (google/gemini-2.0-flash-001) stopped existing and every draft
// failed without a trace. So the default follows the provider's "latest" alias, with pinned fallbacks OpenRouter tries
// in order, and a failed call is logged. ARTE_LLM_MODEL (comma-separated) overrides the list.
const MODELS = (process.env.ARTE_LLM_MODEL || "~anthropic/claude-sonnet-latest,anthropic/claude-sonnet-5.5,~google/gemini-flash-latest")
  .split(",").map((m) => m.trim()).filter(Boolean).slice(0, 3);

const REASONING_ROOM = 2000;

async function claude(prompt: string, opts: { system?: string; maxTokens?: number }): Promise<string | null> {
  try {
    // one bounded attempt: the callers run inside functions with a time limit and have their own fallback text
    const client = new Anthropic({ timeout: 45_000, maxRetries: 0 });
    const r = await client.beta.messages.create({
      model: CLAUDE_MODEL,
      // this model always thinks before answering and thinking is billed against max_tokens: low effort keeps it short,
      // and the room on top keeps a draft from coming back empty. It rejects temperature, so none is sent.
      max_tokens: (opts.maxTokens ?? 900) + REASONING_ROOM,
      output_config: { effort: "low" },
      // a request the model declines is re-run on the model Anthropic recommends instead of coming back empty
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: "user", content: prompt }],
    });
    const text = r.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim() || null;
    if (!text || r.stop_reason !== "end_turn") {
      console.error(`[arte/llm] ${r.model}: stop_reason=${r.stop_reason}, ${text ? "text cut short" : "no text"}`);
    }
    // whatever text comes with a declined request is the refusal or a fragment, not a draft
    return r.stop_reason === "refusal" ? null : text;
  } catch (e) {
    console.error(e instanceof Anthropic.APIError ? `[arte/llm] Claude ${e.status ?? "no response"}: ${e.message}` : `[arte/llm] request failed: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

export async function complete(prompt: string, opts: { system?: string; maxTokens?: number } = {}): Promise<string | null> {
  if (process.env.ANTHROPIC_API_KEY) return claude(prompt, opts);
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        // These models reason before answering, and reasoning is billed against max_tokens: with the caller's budget alone
        // a draft can come back 200 with no text. Keep the thinking short and add room for it on top of the text budget.
        models: MODELS, max_tokens: (opts.maxTokens ?? 900) + REASONING_ROOM, reasoning: { effort: "low" }, temperature: 0.6,
        messages: [...(opts.system ? [{ role: "system", content: opts.system }] : []), { role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) {
      console.error(`[arte/llm] OpenRouter ${r.status}: ${(await r.text()).slice(0, 300)}`);
      return null;
    }
    const d = (await r.json()) as { error?: { message?: string }; model?: string; choices?: { finish_reason?: string; message?: { content?: string } }[] };
    const choice = d.choices?.[0];
    const text = choice?.message?.content?.trim() || null;
    // a 200 can still be a failure: an error object, or the budget spent before any text
    if (!text || (choice?.finish_reason && choice.finish_reason !== "stop")) {
      console.error(`[arte/llm] ${d.model ?? "?"}: ${d.error?.message ?? `finish_reason=${choice?.finish_reason ?? "none"}, ${text ? "text cut short" : "no text"}`}`);
    }
    return text;
  } catch (e) {
    console.error(`[arte/llm] request failed: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}
