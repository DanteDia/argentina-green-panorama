// What an AI action answers, shared by the server actions and the components that call them (no server-only code here).
export type AiAnswer<T> = { value: T } | { error: "limit" | "unavailable" };

export const AI_ERROR: Record<"limit" | "unavailable", string> = {
  limit: "Llegaste al límite de borradores con IA por hoy. Mañana podés seguir.",
  unavailable: "No pudimos generarlo ahora. Probá de nuevo en un momento.",
};

/** One paid model call for an artist who is still under today's cap. `claim` is the atomic server-side counter. */
export async function underCap<T>(claim: () => Promise<boolean>, run: () => Promise<T | null>): Promise<AiAnswer<T>> {
  if (!(await claim())) return { error: "limit" };
  const value = await run();
  return value === null ? { error: "unavailable" } : { value };
}
