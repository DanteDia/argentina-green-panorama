// Server-side only (reads OPENROUTER_API_KEY). Returns null when there is no key or the call fails,
// so every caller has a non-AI fallback.
const MODEL = process.env.ARTE_LLM_MODEL || "google/gemini-2.0-flash-001";

export async function complete(prompt: string, opts: { system?: string; maxTokens?: number } = {}): Promise<string | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL, max_tokens: opts.maxTokens ?? 900, temperature: 0.6,
        messages: [...(opts.system ? [{ role: "system", content: opts.system }] : []), { role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) return null;
    const d = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    return d.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}
