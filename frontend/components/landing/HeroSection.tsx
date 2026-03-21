"use client";

import HeroGraph from "./HeroGraph";

export default function HeroSection() {
  const scrollToPrototype = () => {
    document.getElementById("prototype")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative h-screen flex flex-col items-center justify-center overflow-hidden bg-[#f5f3eb]">
      {/* Decorative graph background */}
      <div className="absolute inset-0 pointer-events-none opacity-60">
        <HeroGraph />
      </div>

      {/* Content overlay */}
      <div className="relative z-10 text-center max-w-3xl mx-auto px-6">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-white/70 backdrop-blur-sm border border-[#1a6b4a]/20 rounded-full px-4 py-1.5 mb-8">
          <span className="w-2 h-2 rounded-full bg-[#1a6b4a] animate-pulse" />
          <span className="text-sm text-[#1a6b4a] font-medium tracking-wide">
            Prototype Live — Argentina Green Ecosystem
          </span>
        </div>

        {/* Headline */}
        <h1 className="font-serif text-6xl md:text-7xl lg:text-8xl font-semibold text-[#1a1a1a] leading-[0.95] tracking-tight mb-6">
          Industries,
          <br />
          <span className="text-[#1a6b4a]">Verified.</span>
        </h1>

        {/* Subtitle */}
        <p className="text-lg md:text-xl text-[#1a1a1a]/70 max-w-xl mx-auto leading-relaxed mb-10">
          AI-powered maps of every industry. Every actor. Every relationship.
          Verified on-chain through decentralized consensus.
        </p>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={scrollToPrototype}
            className="bg-[#1a6b4a] hover:bg-[#155a3e] text-white font-medium px-8 py-3.5 rounded-lg transition-all hover:shadow-lg hover:shadow-[#1a6b4a]/20 text-base"
          >
            Explore Green Panorama
          </button>
          <a
            href="#how-it-works"
            className="bg-white/60 backdrop-blur-sm hover:bg-white/80 text-[#1a1a1a] font-medium px-8 py-3.5 rounded-lg transition-all border border-[#1a1a1a]/10 text-base"
          >
            How It Works
          </a>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
        <button
          onClick={scrollToPrototype}
          className="text-[#1a1a1a]/30 hover:text-[#1a1a1a]/60 transition animate-bounce"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 13l5 5 5-5M7 6l5 5 5-5" />
          </svg>
        </button>
      </div>
    </section>
  );
}
