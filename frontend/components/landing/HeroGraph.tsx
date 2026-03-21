"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

interface HeroNode {
  id?: string | number;
  x?: number;
  y?: number;
  [key: string]: unknown;
}

interface HeroLink {
  source: string;
  target: string;
}

export default function HeroGraph() {
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 });

  useEffect(() => {
    const updateSize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Generate abstract node network
  const graphData = useMemo(() => {
    const nodes: HeroNode[] = [];
    const links: HeroLink[] = [];
    const count = 80;

    for (let i = 0; i < count; i++) {
      nodes.push({ id: `n${i}` });
    }

    // Create organic connections
    for (let i = 0; i < count; i++) {
      const connectionCount = Math.floor(Math.random() * 3) + 1;
      for (let j = 0; j < connectionCount; j++) {
        const target = Math.floor(Math.random() * count);
        if (target !== i) {
          links.push({ source: `n${i}`, target: `n${target}` });
        }
      }
    }

    return { nodes, links };
  }, []);

  const paintNode = useCallback(
    (node: HeroNode, ctx: CanvasRenderingContext2D) => {
      if (node.x == null || node.y == null) return;
      const size = 1.5 + Math.random() * 2;
      ctx.beginPath();
      ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(26, 107, 74, 0.35)";
      ctx.fill();
    },
    []
  );

  return (
    <ForceGraph2D
      graphData={graphData}
      width={dimensions.width}
      height={dimensions.height}
      backgroundColor="transparent"
      nodeCanvasObject={paintNode}
      nodePointerAreaPaint={() => {}}
      linkColor={() => "rgba(26, 107, 74, 0.08)"}
      linkWidth={0.5}
      enableNodeDrag={false}
      enableZoomInteraction={false}
      enablePanInteraction={false}
      d3AlphaDecay={0.008}
      d3VelocityDecay={0.3}
      cooldownTime={Infinity}
      warmupTicks={50}
    />
  );
}
