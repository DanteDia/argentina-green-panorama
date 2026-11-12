import { describe, expect, it } from "vitest";
import { scopeGraph } from "../graph-scope";

const n = (id: string) => ({ id });
const e = (source_id: string, target_id: string) => ({ source_id, target_id });

describe("scopeGraph", () => {
  it("keeps only edges whose two ends are in the cluster", () => {
    const { nodes, edges } = scopeGraph([n("a"), n("b")], [e("a", "b"), e("a", "x")]);
    expect(nodes.map((x) => x.id)).toEqual(["a", "b"]);
    expect(edges).toEqual([e("a", "b")]);
  });

  it("over the cap, keeps the most connected nodes and the edges among them (Arte: 6,000 actors, 13,000 links)", () => {
    const nodes = [n("galeria"), n("museo"), n("a1"), n("a2"), n("a3"), n("suelto")];
    const edges = [e("a1", "galeria"), e("a2", "galeria"), e("a3", "galeria"), e("a1", "museo"), e("a2", "museo")];
    const r = scopeGraph(nodes, edges, 4);
    expect(r.nodes.map((x) => x.id)).toEqual(["galeria", "museo", "a1", "a2"]);   // degree 3, 2, 2, 2; ties keep input order
    expect(r.edges).toEqual([e("a1", "galeria"), e("a2", "galeria"), e("a1", "museo"), e("a2", "museo")]);
  });

  it("under the cap, returns every node, connected or not", () => {
    expect(scopeGraph([n("a"), n("b"), n("c")], [e("a", "b")], 10).nodes).toHaveLength(3);
  });
});
