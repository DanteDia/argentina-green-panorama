"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import createGlobe from "cobe";

interface MarkerData {
  location: [number, number];
  size: number;
  label: string;
  nodes: number;
}

const MARKERS: MarkerData[] = [
  // Argentina — sizes represent node density
  { location: [-34.6037, -58.3816], size: 0.1, label: "Buenos Aires", nodes: 45 },
  { location: [-31.4201, -64.1888], size: 0.06, label: "Cordoba", nodes: 12 },
  { location: [-32.8895, -68.8458], size: 0.05, label: "Mendoza", nodes: 8 },
  { location: [-32.9468, -60.6393], size: 0.06, label: "Rosario", nodes: 10 },
  { location: [-24.7821, -65.4232], size: 0.04, label: "Salta", nodes: 5 },
  { location: [-26.8241, -65.2226], size: 0.04, label: "Tucuman", nodes: 4 },
  { location: [-38.9516, -68.0591], size: 0.03, label: "Neuquen", nodes: 3 },
  { location: [-42.7692, -65.0385], size: 0.03, label: "Patagonia", nodes: 6 },
  { location: [-27.4512, -58.9867], size: 0.04, label: "Chaco", nodes: 7 },
  { location: [-25.2637, -57.5759], size: 0.03, label: "Formosa", nodes: 3 },
  // Global green finance hubs
  { location: [51.5074, -0.1278], size: 0.07, label: "London", nodes: 15 },
  { location: [40.7128, -74.006], size: 0.07, label: "New York", nodes: 12 },
  { location: [1.3521, 103.8198], size: 0.05, label: "Singapore", nodes: 8 },
  { location: [48.8566, 2.3522], size: 0.05, label: "Paris", nodes: 6 },
  { location: [-23.5505, -46.6333], size: 0.06, label: "Sao Paulo", nodes: 9 },
];

interface HeroGlobeProps {
  onMarkerHover?: (marker: MarkerData | null) => void;
}

export default function HeroGlobe({ onMarkerHover }: HeroGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerInteracting = useRef<number | null>(null);
  const pointerInteractionMovement = useRef(0);
  const phiRef = useRef(5.2);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    pointerInteracting.current = e.clientX - pointerInteractionMovement.current;
    if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
  }, []);

  const onPointerUp = useCallback(() => {
    pointerInteracting.current = null;
    if (canvasRef.current) canvasRef.current.style.cursor = "grab";
  }, []);

  const onPointerOut = useCallback(() => {
    pointerInteracting.current = null;
    if (canvasRef.current) canvasRef.current.style.cursor = "grab";
    onMarkerHover?.(null);
  }, [onMarkerHover]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (pointerInteracting.current !== null) {
      const delta = e.clientX - pointerInteracting.current;
      pointerInteractionMovement.current = delta;
    }
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;

    let animationFrame: number;
    const width = canvasRef.current.offsetWidth;

    const globe = createGlobe(canvasRef.current, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: 5.2,
      theta: 0.3,
      dark: 0,
      diffuse: 1.4,
      mapSamples: 24000,
      mapBrightness: 1.1,
      baseColor: [0.94, 0.92, 0.87],
      markerColor: [0.1, 0.42, 0.29],
      glowColor: [0.92, 0.9, 0.85],
      markers: MARKERS.map((m) => ({
        location: m.location,
        size: m.size,
      })),
      scale: 1.05,
    });

    const animate = () => {
      if (pointerInteracting.current !== null) {
        phiRef.current += pointerInteractionMovement.current / 200;
        pointerInteractionMovement.current *= 0.95;
      } else {
        phiRef.current += 0.002;
      }
      globe.update({ phi: phiRef.current });
      animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrame);
      globe.destroy();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerOut={onPointerOut}
      onPointerMove={onPointerMove}
      className="w-full h-full cursor-grab"
      style={{
        contain: "layout paint size",
        maxWidth: "100%",
        aspectRatio: "1",
      }}
    />
  );
}

export type { MarkerData };
