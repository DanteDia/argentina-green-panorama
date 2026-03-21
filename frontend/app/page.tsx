"use client";

import { useEffect, useState, useCallback } from "react";
import GraphCanvas from "@/components/GraphCanvas";
import FilterSidebar from "@/components/FilterSidebar";
import NodeDetailPanel from "@/components/NodeDetailPanel";
import { GreenNode, GreenEdge, NodeVerificationState } from "@/lib/types";
import { fetchGraph } from "@/lib/api";

export default function Home() {
  const [nodes, setNodes] = useState<GreenNode[]>([]);
  const [edges, setEdges] = useState<GreenEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<GreenNode | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [lang, setLang] = useState<"es" | "en">("es");
  const [loading, setLoading] = useState(true);
  const [verificationStates, setVerificationStates] = useState<
    Record<string, NodeVerificationState>
  >({});

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
  const verifiedCount =
    nodes.filter((n) => n.verified).length +
    Object.values(verificationStates).filter(
      (v) => v.status === "finalized" || v.status === "accepted"
    ).length;

  const handleNodeClick = useCallback((node: GreenNode) => {
    setSelectedNode(node);
  }, []);

  const handleNodeNavigate = useCallback((node: GreenNode) => {
    setSelectedNode(node);
  }, []);

  const toggleLang = useCallback(() => {
    setLang((prev) => (prev === "es" ? "en" : "es"));
  }, []);

  // Poll transaction status
  const pollStatus = useCallback(
    async (nodeId: string, txHash: string, type: "node" | "social") => {
      const maxAttempts = 60; // 5 min max
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        try {
          const res = await fetch(`/api/verify/status?txHash=${txHash}`);
          const data = await res.json();

          if (
            data.status === "ACCEPTED" ||
            data.status === "FINALIZED"
          ) {
            // Fetch verification result
            const resultType = type === "social" ? "social" : "node";
            const resultRes = await fetch(
              `/api/verify/result?nodeId=${nodeId}&type=${resultType}`
            );
            const result = await resultRes.json();

            setVerificationStates((prev) => ({
              ...prev,
              [nodeId]: {
                ...prev[nodeId],
                ...(type === "node"
                  ? { status: "finalized", result }
                  : { socialStatus: "finalized", socialResult: result }),
              },
            }));

            // Update node verified flag
            if (type === "node") {
              setNodes((prev) =>
                prev.map((n) =>
                  n.id === nodeId
                    ? { ...n, verified: true, verification_tx: txHash }
                    : n
                )
              );
            }
            return;
          }
        } catch {
          // continue polling
        }
      }

      // Timeout
      setVerificationStates((prev) => ({
        ...prev,
        [nodeId]: {
          ...prev[nodeId],
          ...(type === "node"
            ? { status: "failed" as const }
            : { socialStatus: "failed" as const }),
        },
      }));
    },
    []
  );

  const handleVerify = useCallback(
    async (node: GreenNode) => {
      setVerificationStates((prev) => ({
        ...prev,
        [node.id]: { ...prev[node.id], status: "pending" },
      }));

      try {
        const res = await fetch("/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId: node.id,
            nombre: node.nombre,
            link: node.link,
            cluster: node.cluster,
            categoria: node.categoria,
            descripcion: node.descripcion,
          }),
        });

        const data = await res.json();
        if (data.txHash) {
          setVerificationStates((prev) => ({
            ...prev,
            [node.id]: { ...prev[node.id], status: "pending", txHash: data.txHash },
          }));
          pollStatus(node.id, data.txHash, "node");
        } else {
          setVerificationStates((prev) => ({
            ...prev,
            [node.id]: { ...prev[node.id], status: "failed" },
          }));
        }
      } catch {
        setVerificationStates((prev) => ({
          ...prev,
          [node.id]: { ...prev[node.id], status: "failed" },
        }));
      }
    },
    [pollStatus]
  );

  const handleSocialAudit = useCallback(
    async (node: GreenNode) => {
      setVerificationStates((prev) => ({
        ...prev,
        [node.id]: { ...prev[node.id], socialStatus: "pending" },
      }));

      // Extract social links from node.link (often Instagram/LinkedIn)
      const socialLinks = node.link ? [node.link] : [];
      const claimedFollowers: Record<string, number> = {};
      if (node.followers && node.link) {
        // Detect platform from URL
        if (node.link.includes("instagram")) claimedFollowers.instagram = node.followers;
        else if (node.link.includes("linkedin")) claimedFollowers.linkedin = node.followers;
        else if (node.link.includes("twitter") || node.link.includes("x.com"))
          claimedFollowers.twitter = node.followers;
        else claimedFollowers.website = node.followers;
      }

      try {
        const res = await fetch("/api/verify/social", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId: node.id,
            nombre: node.nombre,
            socialLinks,
            claimedFollowers,
          }),
        });

        const data = await res.json();
        if (data.txHash) {
          setVerificationStates((prev) => ({
            ...prev,
            [node.id]: {
              ...prev[node.id],
              socialStatus: "pending",
              socialTxHash: data.txHash,
            },
          }));
          pollStatus(node.id, data.txHash, "social");
        } else {
          setVerificationStates((prev) => ({
            ...prev,
            [node.id]: { ...prev[node.id], socialStatus: "failed" },
          }));
        }
      } catch {
        setVerificationStates((prev) => ({
          ...prev,
          [node.id]: { ...prev[node.id], socialStatus: "failed" },
        }));
      }
    },
    [pollStatus]
  );

  const [isBatchVerifying, setIsBatchVerifying] = useState(false);

  const handleBatchVerify = useCallback(async () => {
    setIsBatchVerifying(true);
    try {
      const res = await fetch("/api/verify/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 5 }),
      });
      const data = await res.json();
      if (data.results) {
        for (const r of data.results) {
          if (r.txHash) {
            setVerificationStates((prev) => ({
              ...prev,
              [r.nodeId]: { ...prev[r.nodeId], status: "pending", txHash: r.txHash },
            }));
            pollStatus(r.nodeId, r.txHash, "node");
          }
        }
      }
    } catch {
      // batch failed
    } finally {
      setIsBatchVerifying(false);
    }
  }, [pollStatus]);

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
        onBatchVerify={handleBatchVerify}
        isBatchVerifying={isBatchVerifying}
      />

      {/* Graph Canvas - offset by sidebar width */}
      <div className="ml-72">
        <GraphCanvas
          nodes={nodes}
          edges={edges}
          selectedCluster={selectedCluster}
          searchQuery={searchQuery}
          onNodeClick={handleNodeClick}
          verificationStates={verificationStates}
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
          verificationState={verificationStates[selectedNode.id]}
          onVerify={handleVerify}
          onSocialAudit={handleSocialAudit}
        />
      )}
    </main>
  );
}
