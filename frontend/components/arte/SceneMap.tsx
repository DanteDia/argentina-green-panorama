"use client";
import GraphCanvas from "@/components/GraphCanvas";
import type { GreenEdge, GreenNode } from "@/lib/types";

export interface MapNode { id: string; name: string; cluster: "vos" | "espacio" | "artista"; link: string | null; descripcion: string }
const COLORS = { vos: "#c2410c", espacio: "#1c1b18", artista: "#8a8577" };

export function SceneMap({ nodes, edges, me }: { nodes: MapNode[]; edges: { source: string; target: string }[]; me: string }) {
  const gn = nodes.map((n) => ({
    id: n.id, nombre: n.name, link: n.link, followers: null, cluster: n.cluster, categoria: n.cluster, quien_fondea: "", aliados_portfolio: [], clientes: [],
    descripcion: n.descripcion, verified: false, verification_tx: null, verification_status: "unverified",
  })) as unknown as GreenNode[];
  const ge = edges.map((e, i) => ({ id: String(i), source_id: e.source, target_id: e.target, relationship_type: "ecosystem", description: "", confidence: 1, source: "arte" })) as GreenEdge[];
  return (
    <div className="card mt-6 h-[70vh] overflow-hidden">
      <GraphCanvas nodes={gn} edges={ge} selectedCluster={null} searchQuery="" highlightedNodes={[me]} clusterColors={COLORS} hideVerificationBadges
        onNodeClick={(n) => { if (n.link) window.open(n.link, "_blank", "noopener"); }} />
    </div>
  );
}
