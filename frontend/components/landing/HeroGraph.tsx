"use client";

import { useEffect, useRef } from "react";
import createGlobe from "cobe";

const MARKERS: { location: [number, number]; size: number }[] = [
  // Argentina
  { location: [-34.6037, -58.3816], size: 0.08 }, // Buenos Aires
  { location: [-31.4201, -64.1888], size: 0.05 }, // Cordoba
  { location: [-32.8895, -68.8458], size: 0.04 }, // Mendoza
  { location: [-32.9468, -60.6393], size: 0.05 }, // Rosario
  { location: [-24.7821, -65.4232], size: 0.04 }, // Salta
  { location: [-26.8241, -65.2226], size: 0.04 }, // Tucuman
  { location: [-38.9516, -68.0591], size: 0.03 }, // Neuquen
  { location: [-42.7692, -65.0385], size: 0.03 }, // Rawson
  { location: [-27.4512, -58.9867], size: 0.03 }, // Resistencia
  { location: [-25.2637, -57.5759], size: 0.03 }, // Formosa
  // Global green finance
  { location: [51.5074, -0.1278], size: 0.06 },  // London
  { location: [40.7128, -74.006], size: 0.06 },   // New York
  { location: [1.3521, 103.8198], size: 0.05 },   // Singapore
  { location: [48.8566, 2.3522], size: 0.04 },    // Paris
  { location: [-23.5505, -46.6333], size: 0.05 }, // Sao Paulo
];

export default function HeroGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    let phi = 0.8;
    let animationFrame: number;

    const width = canvasRef.current.offsetWidth;

    const globe = createGlobe(canvasRef.current, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: 0.8,
      theta: -0.15,
      dark: 0,
      diffuse: 1.4,
      mapSamples: 20000,
      mapBrightness: 1.1,
      baseColor: [0.94, 0.92, 0.87],
      markerColor: [0.1, 0.42, 0.29],
      glowColor: [0.92, 0.9, 0.85],
      markers: MARKERS,
    });

    const animate = () => {
      phi += 0.002;
      globe.update({ phi });
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
      className="w-full h-full"
      style={{
        contain: "layout paint size",
        maxWidth: "100%",
        aspectRatio: "1",
      }}
    />
  );
}
