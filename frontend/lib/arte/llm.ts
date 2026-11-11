// Server-side only (reads OPENROUTER_API_KEY). Returns null when there is no key or the call fails,
// so every caller has a non-AI fallback.
//
// Model ids get retired: the previous hard-coded one (google/gemini-2.0-flash-001) stopped existing and every draft
// failed without a trace. So the default follows the provider's "latest" alias, with pinned fallbacks OpenRouter tries
// in order, and a failed call is logged. ARTE_LLM_MODEL (comma-separated) overrides the list.
const MODELS = (process.env.ARTE_LLM_MODEL || "~anthropic/claude-sonnet-latest,anthropic/claude-sonnet-5.5,~google/gemini-flash-latest")
  .split(",").map((m) => m.trim()).filter(Boolean).slice(0, 3);

const REASONING_ROOM = 2000;

export async function complete(prompt: string, opts: { system?: string; maxTokens?: number } = {}): Promise<string | null> {
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
