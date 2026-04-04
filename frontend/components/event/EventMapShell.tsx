"use client";

import { useEffect, useState, useCallback } from "react";
import GraphCanvas from "@/components/GraphCanvas";
import FilterSidebar from "@/components/FilterSidebar";
import NodeDetailPanel from "@/components/NodeDetailPanel";
import AIChatPanel from "@/components/AIChatPanel";
import OpportunityPanel from "./OpportunityPanel";
import EventHeader from "./EventHeader";
import { GreenNode, GreenEdge, NodeVerificationState } from "@/lib/types";
import { BLOCKCHAIN_CLUSTER_COLORS, EVENT_EDGE_COLORS, EVENT_EDGE_LABELS } from "@/lib/event-types";
import { useIsMobile } from "@/hooks/useIsMobile";

interface EventMapShellProps {
  slug: string;
  eventName: string;
  eventDates: string;
  eventLocation: string;
}

export default function EventMapShell({ slug, eventName, eventDates, eventLocation }: EventMapShellProps) {
  const [nodes, setNodes] = useState<GreenNode[]>([]);
  const [edges, setEdges] = useState<GreenEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<GreenNode | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [verificationStates] = useState<Record<string, NodeVerificationState>>({});
  const [highlightedNodes, setHighlightedNodes] = useState<string[]>([]);
  const [activeEdgeTypes, setActiveEdgeTypes] = useState<Set<string>>(
    new Set(Object.keys(EVENT_EDGE_COLORS))
  );
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/event/${slug}/graph`)
      .then((res) => res.json())
      .then((data) => {
        if (data.nodes && data.edges) {
          setNodes(data.nodes);
          setEdges(data.edges);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [slug]);

  const clusters = [...new Set(nodes.map((n) => n.cluster))].sort();
  const verifiedCount = nodes.filter((n) => n.verified).length;

  const handleNodeClick = useCallback((node: GreenNode) => {
    setSelectedNode(node);
  }, []);

  const handleNodeNavigate = useCallback((node: GreenNode) => {
    setSelectedNode(node);
  }, []);

  const handleHighlightNode = useCallback((nodeId: string) => {
    setHighlightedNodes([nodeId]);
    const node = nodes.find((n) => n.id === nodeId);
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

  if (loading) {
    return (
      <div className="h-screen bg-[#0a0f1a] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60 text-sm">Loading {eventName} map...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#0a0f1a] flex flex-col overflow-hidden">
      {/* Fixed header */}
      <EventHeader
        eventName={eventName}
        eventDates={eventDates}
        eventLocation={eventLocation}
        isMobile={isMobile}
        onMenuToggle={() => setSidebarOpen((v) => !v)}
      />

      {/* Main content — fills remaining viewport height */}
      <div className="flex-1 relative overflow-hidden">
        {/* Mobile sidebar backdrop */}
        {isMobile && sidebarOpen && (
          <div
            className="absolute inset-0 bg-black/50 z-30 transition-opacity"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar — drawer on mobile, fixed on desktop */}
        <div
          className={`absolute top-0 bottom-0 z-40 transition-transform duration-300 ${
            isMobile
              ? `left-0 w-72 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`
              : "left-0 w-72"
          }`}
        >
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
            lang="en"
            onLangToggle={() => {}}
            nodes={nodes}
            onSearchSelect={(node) => {
              handleNodeClick(node);
              if (isMobile) setSidebarOpen(false);
            }}
            activeEdgeTypes={activeEdgeTypes}
            onToggleEdgeType={handleToggleEdgeType}
            title={eventName}
            subtitle={`${eventLocation} | ${eventDates}`}
            clusterColors={BLOCKCHAIN_CLUSTER_COLORS}
            edgeColors={EVENT_EDGE_COLORS}
            edgeLabelsOverride={EVENT_EDGE_LABELS}
            hideActivityFeed={true}
          />
        </div>

        {/* Graph — full width on mobile, offset on desktop */}
        <div className={`absolute top-0 right-0 bottom-0 ${isMobile ? "left-0" : "left-72"}`}>
          <GraphCanvas
            nodes={nodes}
            edges={edges}
            selectedCluster={selectedCluster}
            searchQuery={searchQuery}
            onNodeClick={handleNodeClick}
            verificationStates={verificationStates}
            highlightedNodes={highlightedNodes}
            activeEdgeTypes={activeEdgeTypes}
            clusterColors={BLOCKCHAIN_CLUSTER_COLORS}
            edgeColors={EVENT_EDGE_COLORS}
            darkMode={true}
            isMobile={isMobile}
          />
        </div>

        {/* Node Detail Panel — right side overlay (full screen on mobile) */}
        {selectedNode && (
          <NodeDetailPanel
            node={selectedNode}
            edges={edges}
            allNodes={nodes}
            onClose={() => setSelectedNode(null)}
            onNodeNavigate={handleNodeNavigate}
            lang="en"
            verificationState={verificationStates[selectedNode.id]}
            isMobile={isMobile}
          />
        )}

        {/* Floating buttons — fixed to bottom-right of the content area */}
        <div className="absolute bottom-0 right-0 z-50">
          <OpportunityPanel
            slug={slug}
            onHighlightNode={handleHighlightNode}
            onHighlightNodes={setHighlightedNodes}
            isMobile={isMobile}
          />
          <AIChatPanel
            nodes={nodes}
            edges={edges}
            lang="en"
            context={slug}
            onHighlightNodes={setHighlightedNodes}
            isMobile={isMobile}
          />
        </div>
      </div>
    </div>
  );
}
