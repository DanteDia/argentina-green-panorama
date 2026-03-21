"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { GreenNode, GreenEdge, CLUSTER_COLORS, EDGE_COLORS, NodeVerificationState } from "@/lib/types";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

interface GraphCanvasProps {
  nodes: GreenNode[];
  edges: GreenEdge[];
  selectedCluster: string | null;
  searchQuery: string;
  onNodeClick: (node: GreenNode) => void;
  verificationStates?: Record<string, NodeVerificationState>;
  highlightedNodes?: string[];
  activeEdgeTypes?: Set<string>;
}

interface ForceNode {
  id: string;
  nombre: string;
  cluster: string;
  categoria: string;
  followers: number | null;
  verified: boolean;
  verificationStatus?: string;
  isGrey?: boolean;
  highlighted?: boolean;
  x?: number;
  y?: number;
  __data: GreenNode;
}

interface ForceLink {
  source: string | ForceNode;
  target: string | ForceNode;
  type: string;
  description: string;
}

export default function GraphCanvas({
  nodes,
  edges,
  selectedCluster,
  searchQuery,
  onNodeClick,
  verificationStates = {},
  highlightedNodes = [],
  activeEdgeTypes,
}: GraphCanvasProps) {
  const fgRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  useEffect(() => {
    const updateSize = () => {
      setDimensions({
        width: window.innerWidth - 288, // subtract sidebar width (w-72 = 288px)
        height: window.innerHeight,
      });
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Build graph data for force-graph
  const graphData = useMemo(() => {
    const filteredNodes = nodes.filter((n) => {
      if (selectedCluster && n.cluster !== selectedCluster) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          n.nombre.toLowerCase().includes(q) ||
          n.descripcion?.toLowerCase().includes(q) ||
          n.categoria?.toLowerCase().includes(q)
        );
      }
      return true;
    });

    const nodeIds = new Set(filteredNodes.map((n) => n.id));

    const highlightSet = new Set(highlightedNodes.map((n) => n.toLowerCase()));

    const forceNodes: ForceNode[] = filteredNodes.map((n) => ({
      id: n.id,
      nombre: n.nombre,
      cluster: n.cluster,
      categoria: n.categoria,
      followers: n.followers,
      verified: n.verified || verificationStates[n.id]?.status === "finalized" || verificationStates[n.id]?.status === "accepted",
      verificationStatus: verificationStates[n.id]?.status,
      isGrey: n.verification_status === "grey",
      highlighted: highlightSet.has(n.nombre.toLowerCase()),
      __data: n,
    }));

    const forceLinks: ForceLink[] = edges
      .filter((e) => {
        if (!nodeIds.has(e.source_id) || !nodeIds.has(e.target_id)) return false;
        if (activeEdgeTypes && !activeEdgeTypes.has(e.relationship_type)) return false;
        return true;
      })
      .map((e) => ({
        source: e.source_id,
        target: e.target_id,
        type: e.relationship_type,
        description: e.description,
      }));

    return { nodes: forceNodes, links: forceLinks };
  }, [nodes, edges, selectedCluster, searchQuery, verificationStates, highlightedNodes, activeEdgeTypes]);

  // Node size based on connections + followers
  const getNodeSize = useCallback(
    (node: ForceNode) => {
      const connections = edges.filter(
        (e) => e.source_id === node.id || e.target_id === node.id
      ).length;
      const followerBonus = node.followers ? Math.log10(node.followers + 1) : 0;
      return Math.max(4, connections * 1.5 + followerBonus + 3);
    },
    [edges]
  );

  const paintNode = useCallback(
    (node: ForceNode, ctx: CanvasRenderingContext2D) => {
      const size = getNodeSize(node);
      const color = CLUSTER_COLORS[node.cluster] || "#6b7280";
      const isHovered = hoveredNode === node.id;
      const isHighlighted = node.highlighted;
      const isSearchMatch =
        searchQuery &&
        node.nombre.toLowerCase().includes(searchQuery.toLowerCase());

      // Glow effect for hovered/searched/highlighted nodes
      if (isHovered || isSearchMatch || isHighlighted) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
      }

      // Draw node circle — grey mode nodes are desaturated
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, size, 0, 2 * Math.PI);
      ctx.fillStyle = node.isGrey ? "#4b5563" : color;
      ctx.globalAlpha = node.isGrey ? 0.5 : (isHovered ? 1 : 0.85);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Border
      ctx.strokeStyle = isHovered ? "#ffffff" : "rgba(255,255,255,0.3)";
      ctx.lineWidth = isHovered ? 2 : 0.5;
      ctx.stroke();

      // Reset shadow
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;

      // Verification badge
      if (node.verified || node.isGrey || node.verificationStatus === "pending" || node.verificationStatus === "failed") {
        const badgeX = node.x! + size * 0.7;
        const badgeY = node.y! - size * 0.7;
        const badgeR = node.verified ? 4 : 3;

        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeR, 0, 2 * Math.PI);

        if (node.isGrey) {
          // Grey badge with "?" feel — manual review needed
          ctx.fillStyle = "#6b7280";
        } else if (node.verificationStatus === "pending") {
          // Pulsing amber for pending
          const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);
          ctx.fillStyle = `rgba(245, 158, 11, ${0.5 + pulse * 0.5})`;
        } else if (node.verificationStatus === "failed") {
          ctx.fillStyle = "#ef4444";
        } else {
          ctx.fillStyle = "#22c55e";
        }

        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Label
      if (isHovered || size > 7 || isSearchMatch || isHighlighted) {
        ctx.font = `${isHovered ? "bold " : ""}${
          isHovered ? "11px" : "9px"
        } Inter, Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "rgba(0,0,0,0.7)";
        ctx.lineWidth = 3;
        ctx.strokeText(node.nombre, node.x!, node.y! + size + 3);
        ctx.fillText(node.nombre, node.x!, node.y! + size + 3);
      }
    },
    [hoveredNode, searchQuery, getNodeSize]
  );

  const paintLink = useCallback(
    (link: ForceLink, ctx: CanvasRenderingContext2D) => {
      const source = link.source as ForceNode;
      const target = link.target as ForceNode;
      if (!source.x || !target.x) return;

      const color = EDGE_COLORS[link.type] || "#4b5563";

      ctx.beginPath();
      ctx.moveTo(source.x, source.y!);
      ctx.lineTo(target.x, target.y!);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = link.type === "funds" ? 1.5 : 0.8;

      if (link.type === "client_of") {
        ctx.setLineDash([4, 4]);
      }

      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    },
    []
  );

  return (
    <ForceGraph2D
      ref={fgRef}
      width={dimensions.width}
      height={dimensions.height}
      graphData={graphData}
      nodeCanvasObject={paintNode as any}
      linkCanvasObject={paintLink as any}
      nodePointerAreaPaint={((node: ForceNode, color: string, ctx: CanvasRenderingContext2D) => {
        const size = getNodeSize(node);
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, size + 2, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
      }) as any}
      onNodeClick={((node: ForceNode) => onNodeClick(node.__data)) as any}
      onNodeHover={((node: ForceNode | null) =>
        setHoveredNode(node ? node.id : null)
      ) as any}
      backgroundColor="#0a0a0a"
      d3AlphaDecay={0.02}
      d3VelocityDecay={0.3}
      warmupTicks={100}
      cooldownTicks={200}
      linkDirectionalArrowLength={3}
      linkDirectionalArrowRelPos={0.8}
    />
  );
}
