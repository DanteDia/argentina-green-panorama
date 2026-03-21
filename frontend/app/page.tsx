"use client";

import { useEffect, useState, useCallback } from "react";
import GraphCanvas from "@/components/GraphCanvas";
import FilterSidebar from "@/components/FilterSidebar";
import NodeDetailPanel from "@/components/NodeDetailPanel";
import { GreenNode, GreenEdge } from "@/lib/types";
import { fetchGraph } from "@/lib/api";

export default function Home() {
  const [nodes, setNodes] = useState<GreenNode[]>([]);
  const [edges, setEdges] = useState<GreenEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<GreenNode | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [lang, setLang] = useState<"es" | "en">("es");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGraph()
      .then((data) => {
        setNodes(data.nodes);
        setEdges(data.edges);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const clusters = [...new Set(nodes.map((n) => n.cluster))].sort();
  const verifiedCount = nodes.filter((n) => n.verified).length;

  const handleNodeClick = useCallback((node: GreenNode) => {
    setSelectedNode(node);
  }, []);

  const handleNodeNavigate = useCallback((node: GreenNode) => {
    setSelectedNode(node);
  }, []);

  const toggleLang = useCallback(() => {
    setLang((prev) => (prev === "es" ? "en" : "es"));
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-green-400 mt-4 text-sm">
            {lang === "es" ? "Cargando ecosistema verde..." : "Loading green ecosystem..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-zinc-950">
      {/* Filter Sidebar */}
      <FilterSidebar
        clusters={clusters}
        selectedCluster={selectedCluster}
        onClusterSelect={setSelectedCluster}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        nodeCount={nodes.length}
        edgeCount={edges.length}
        verifiedCount={verifiedCount}
        lang={lang}
        onLangToggle={toggleLang}
      />

      {/* Graph Canvas - offset by sidebar width */}
      <div className="ml-72">
        <GraphCanvas
          nodes={nodes}
          edges={edges}
          selectedCluster={selectedCluster}
          searchQuery={searchQuery}
          onNodeClick={handleNodeClick}
        />
      </div>

      {/* Node Detail Panel */}
      {selectedNode && (
        <NodeDetailPanel
          node={selectedNode}
          edges={edges}
          allNodes={nodes}
          onClose={() => setSelectedNode(null)}
          onNodeNavigate={handleNodeNavigate}
          lang={lang}
        />
      )}
    </main>
  );
}
