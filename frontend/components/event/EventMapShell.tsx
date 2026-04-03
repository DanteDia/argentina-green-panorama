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
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60 text-sm">Loading {eventName} map...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1a] relative overflow-hidden">
      <EventHeader
        eventName={eventName}
        eventDates={eventDates}
        eventLocation={eventLocation}
      />

      {/* Sidebar */}
      <div className="pt-12">
        <FilterSidebar
          clusters={clusters}
          selectedCluster={selectedCluster}
          onClusterSelect={setSelectedCluster}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          nodeCount={nodes.length}
          edgeCount={edges.length}
          verifiedCount={verifiedCount}
          lang="en"
          onLangToggle={() => {}}
          nodes={nodes}
          onSearchSelect={handleNodeClick}
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

      {/* Graph */}
      <div className="ml-[304px] pt-12">
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
          lang="en"
          verificationState={verificationStates[selectedNode.id]}
        />
      )}

      {/* Opportunity Matcher */}
      <OpportunityPanel
        slug={slug}
        onHighlightNode={handleHighlightNode}
        onHighlightNodes={setHighlightedNodes}
      />

      {/* AI Chat */}
      <AIChatPanel
        nodes={nodes}
        edges={edges}
        lang="en"
        context={slug}
        onHighlightNodes={setHighlightedNodes}
      />
    </div>
  );
}
