/** The graph of one cluster: its nodes and the edges whose two ends are among them. Over `max` nodes, only the `max`
 *  most connected are kept (ties keep their order), so a big cluster draws its core instead of thousands of loose dots. */
export function scopeGraph<N extends { id: string }, E extends { source_id: string; target_id: string }>(
  nodes: N[], edges: E[], max?: number,
): { nodes: N[]; edges: E[] } {
  const ids = new Set(nodes.map((x) => x.id));
  let inScope = edges.filter((x) => ids.has(x.source_id) && ids.has(x.target_id));
  if (!max || nodes.length <= max) return { nodes, edges: inScope };
  const degree = new Map<string, number>();
  for (const x of inScope) {
    degree.set(x.source_id, (degree.get(x.source_id) ?? 0) + 1);
    degree.set(x.target_id, (degree.get(x.target_id) ?? 0) + 1);
  }
  const kept = nodes
    .map((x, i) => ({ x, i, d: degree.get(x.id) ?? 0 }))
    .sort((a, b) => b.d - a.d || a.i - b.i)
    .slice(0, max)
    .map((k) => k.x);
  const keptIds = new Set(kept.map((x) => x.id));
  inScope = inScope.filter((x) => keptIds.has(x.source_id) && keptIds.has(x.target_id));
  return { nodes: kept, edges: inScope };
}
