"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { fetchStats } from "@/lib/api";

const HeroGlobe = dynamic(() => import("./HeroGraph"), { ssr: false });

export default function HeroSection() {
  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState({ total_nodes: 0, total_edges: 0, verified_nodes: 0 });

  useEffect(() => {
    setMounted(true);
    fetchStats().then(setStats).catch(() => {});
  }, []);

  const scrollToPrototype = () => {
    document.getElementById("prototype")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden bg-[#f5f3eb]">
      {/* Subtle gradient overlay from left for text readability */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#f5f3eb] via-[#f5f3eb]/80 to-transparent z-[1]" />

      {/* Globe - right side on desktop */}
      <div className="absolute right-[-5%] top-1/2 -translate-y-1/2 w-[650px] h-[650px] md:w-[750px] md:h-[750px] lg:w-[850px] lg:h-[850px] opacity-80">
        {mounted && <HeroGlobe />}
      </div>

      {/* Content - left aligned */}
      <div
        className={`relative z-10 max-w-7xl mx-auto px-8 md:px-16 w-full transition-all duration-1000 ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <div className="max-w-xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-white/60 backdrop-blur-sm border border-[#1a6b4a]/15 rounded-full px-5 py-2 mb-10">
            <span className="w-2 h-2 rounded-full bg-[#1a6b4a] animate-pulse" />
            <span className="text-sm text-[#1a6b4a] font-medium tracking-wide">
              Live Prototype — Argentina
            </span>
          </div>

          {/* Headline */}
          <h1 className="font-serif text-5xl md:text-6xl lg:text-[5.5rem] font-semibold text-[#1a1a1a] leading-[0.92] tracking-tight mb-7">
            Industries,
            <br />
            <span className="text-[#1a6b4a]">Verified.</span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg md:text-xl text-[#1a1a1a]/60 leading-relaxed mb-10 max-w-md">
            AI-powered maps of every industry. Every actor, every relationship,
            every money flow — verified on-chain.
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={scrollToPrototype}
              className="bg-[#1a6b4a] hover:bg-[#155a3e] text-white font-medium px-7 py-3 rounded-lg transition-all hover:shadow-lg hover:shadow-[#1a6b4a]/20 text-[15px]"
            >
              Explore Green Panorama
            </button>
            <a
              href="#how-it-works"
              className="bg-white/50 backdrop-blur-sm hover:bg-white/70 text-[#1a1a1a] font-medium px-7 py-3 rounded-lg transition-all border border-[#1a1a1a]/8 text-[15px] flex items-center gap-2"
            >
              How It Works
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-40">
                <path d="M7 13l5 5 5-5M7 6l5 5 5-5" />
              </svg>
            </a>
          </div>

          {/* Micro stats under CTA */}
          <div className="mt-12 flex gap-8 text-sm">
            <div>
              <span className="font-mono text-[#1a6b4a] text-lg font-semibold">{stats.total_nodes || "—"}+</span>
              <p className="text-[#1a1a1a]/35 mt-0.5">Actors mapped</p>
            </div>
            <div>
              <span className="font-mono text-[#1a6b4a] text-lg font-semibold">{stats.total_edges || "—"}+</span>
              <p className="text-[#1a1a1a]/35 mt-0.5">Connections</p>
            </div>
            <div>
              <span className="font-mono text-[#1a6b4a] text-lg font-semibold">24/7</span>
              <p className="text-[#1a1a1a]/35 mt-0.5">AI agents</p>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
        <button
          onClick={scrollToPrototype}
          className="text-[#1a1a1a]/20 hover:text-[#1a1a1a]/50 transition animate-bounce"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 13l5 5 5-5M7 6l5 5 5-5" />
          </svg>
        </button>
      </div>
    </section>
  );
}
