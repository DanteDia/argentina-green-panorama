"use client";

import { useState, useCallback } from "react";
import HeroSection from "@/components/landing/HeroSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import PrototypeSection from "@/components/landing/PrototypeSection";
import StatsSection from "@/components/landing/StatsSection";
import FooterSection from "@/components/landing/FooterSection";

export default function Home() {
  const [lang, setLang] = useState<"es" | "en">("en");
  const toggleLang = useCallback(() => setLang((l) => (l === "es" ? "en" : "es")), []);

  return (
    <main>
      {/* Global nav bar with lang toggle */}
      <nav className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-end px-6 py-3">
        <button
          onClick={toggleLang}
          className="text-xs bg-white/80 backdrop-blur-sm hover:bg-white text-zinc-600 hover:text-[#1a1a1a] px-3 py-1.5 rounded-full border border-[#ddd8ce] shadow-sm transition font-medium"
        >
          {lang === "es" ? "EN" : "ES"}
        </button>
      </nav>

      <HeroSection lang={lang} />
      <HowItWorksSection lang={lang} />
      <PrototypeSection lang={lang} />
      <StatsSection lang={lang} />
      <FooterSection lang={lang} />
    </main>
  );
}
