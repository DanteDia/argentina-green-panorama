"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import GraphCanvas from "@/components/GraphCanvas";
import FilterSidebar from "@/components/FilterSidebar";
import NodeDetailPanel from "@/components/NodeDetailPanel";
import AIChatPanel from "@/components/AIChatPanel";
import { GreenNode, GreenEdge, NodeVerificationState } from "@/lib/types";
import { fetchGraph } from "@/lib/api";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function PrototypeSection({ lang = "en" }: { lang?: "es" | "en" }) {
  const [nodes, setNodes] = useState<GreenNode[]>([]);
  const [edges, setEdges] = useState<GreenEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<GreenNode | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [verificationStates, setVerificationStates] = useState<
    Record<string, NodeVerificationState>
  >({});
  const [highlightedNodes, setHighlightedNodes] = useState<string[]>([]);
  const [activeEdgeTypes, setActiveEdgeTypes] = useState<Set<string>>(
    new Set(["funds", "partners_with", "client_of", "portfolio", "regulates"])
  );
  const sectionRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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


  const pollStatus = useCallback(
    async (nodeId: string, txHash: string, type: "node" | "social") => {
      const maxAttempts = 60;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, 8000));
        try {
          const res = await fetch(`/api/verify/status?txHash=${txHash}`);
          const data = await res.json();

          if (data.status === "ACCEPTED" || data.status === "FINALIZED") {
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

            if (type === "node") {
              // Extract per-field details from result
              const details = result ? {
                exists: result.exists === "yes" || result.exists === true,
                sector_relevant: result.sector_relevant === "yes" || result.sector_relevant === true,
                description_accurate: result.description_accurate === "yes" || result.description_accurate === true,
                geography_relevant: result.geography_relevant === "yes" || result.geography_relevant === true,
              } : undefined;

              setNodes((prev) =>
                prev.map((n) =>
                  n.id === nodeId
                    ? { ...n, verified: true, verification_tx: txHash, verification_details: details }
                    : n
                )
              );
              fetch("/api/nodes/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nodeId, txHash, details }),
              }).catch(() => {});
            }
            return;
          }

          if (data.status === "UNDETERMINED" || data.status === "CANCELED") {
            const leaderResult = data.leaderResult || null;
            setVerificationStates((prev) => ({
              ...prev,
              [nodeId]: {
                ...prev[nodeId],
                ...(type === "node"
                  ? { status: "failed" as const, result: leaderResult }
                  : { socialStatus: "failed" as const, socialResult: leaderResult }),
              },
            }));
            return;
          }
        } catch {
          // continue polling
        }
      }

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

      const socialLinks = node.link ? [node.link] : [];
      const claimedFollowers: Record<string, number> = {};
      if (node.followers && node.link) {
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

  const handleHighlightNodes = useCallback((names: string[]) => {
    setHighlightedNodes(names);
    setTimeout(() => setHighlightedNodes([]), 10000);
  }, []);

  const handleChatNodeSelect = useCallback((name: string) => {
    const node = nodes.find((n) => n.nombre.toLowerCase() === name.toLowerCase());
    if (node) setSelectedNode(node);
  }, [nodes]);

  const handleToggleEdgeType = useCallback((type: string) => {
    setActiveEdgeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const handleSearchSelect = useCallback((node: GreenNode) => {
    setSelectedNode(node);
    setSearchQuery("");
  }, []);

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

  return (
    <section
      id="prototype"
      ref={sectionRef}
      className="relative min-h-screen overflow-hidden bg-[#f5f3eb]"
    >
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-2 border-[#1a6b4a] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-[#1a6b4a] mt-4 text-sm">
              {lang === "es" ? "Cargando ecosistema verde..." : "Loading green ecosystem..."}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Section header */}
          <div className="absolute top-0 left-0 right-0 z-30 flex items-center gap-2 md:gap-3 px-4 md:px-6 py-3 bg-[#f5f3eb]/80 backdrop-blur-sm border-b border-[#ddd8ce]">
            {isMobile && (
              <button
                onClick={() => setSidebarOpen((v) => !v)}
                className="text-zinc-600 hover:text-[#1a1a1a] p-1 -ml-1 flex-shrink-0"
                aria-label="Toggle filters"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
                </svg>
              </button>
            )}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#1a6b4a]/10 text-[#1a6b4a] text-xs font-medium rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1a6b4a] animate-pulse" />
              Live Prototype
            </span>
            <span className="text-sm text-zinc-500 hidden sm:inline">Green Industry &bull; Argentina</span>
          </div>

          {/* Mobile sidebar backdrop */}
          {isMobile && sidebarOpen && (
            <div
              className="absolute inset-0 bg-black/30 z-35"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* Sidebar — drawer on mobile */}
          <div className={`${isMobile ? `absolute top-0 bottom-0 left-0 w-72 z-40 transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}` : ""}`}>
            <FilterSidebar
              clusters={clusters}
              selectedCluster={selectedCluster}
              onClusterSelect={(cluster) => {
                setSelectedCluster(cluster);
                if (isMobile) setSidebarOpen(false);
              }}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              nodeCount={nodes.length}
              edgeCount={edges.length}
              verifiedCount={verifiedCount}
              lang={lang}
              onLangToggle={() => {}}
              onBatchVerify={handleBatchVerify}
              isBatchVerifying={isBatchVerifying}
              nodes={nodes}
              onSearchSelect={(node) => {
                handleSearchSelect(node);
                if (isMobile) setSidebarOpen(false);
              }}
              activeEdgeTypes={activeEdgeTypes}
              onToggleEdgeType={handleToggleEdgeType}
            />
          </div>

          <div className={`${isMobile ? "ml-0 mt-14 mx-2" : "ml-[304px] mt-14 mr-4"} mb-4 rounded-2xl overflow-hidden ring-1 ring-[#ddd8ce]`}>
            <GraphCanvas
              nodes={nodes}
              edges={edges}
              selectedCluster={selectedCluster}
              searchQuery={searchQuery}
              onNodeClick={handleNodeClick}
              verificationStates={verificationStates}
              highlightedNodes={highlightedNodes}
              activeEdgeTypes={activeEdgeTypes}
              isMobile={isMobile}
            />
          </div>

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
              isMobile={isMobile}
            />
          )}

          <AIChatPanel
            lang={lang}
            onHighlightNodes={handleHighlightNodes}
            onNodeSelect={handleChatNodeSelect}
            isMobile={isMobile}
          />
        </>
      )}
    </section>
  );
}
