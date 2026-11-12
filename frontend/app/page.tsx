"use client";

import { useState, useCallback } from "react";
import HeroSection from "@/components/landing/HeroSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import PrototypeSection from "@/components/landing/PrototypeSection";
import StatsSection from "@/components/landing/StatsSection";
import FooterSection from "@/components/landing/FooterSection";
import { CLUSTERS, newestCluster } from "@/lib/clusters";

const bannerText = {
  es: { new: "Nuevo", maps: "Mapas", eyebrow: "Un mapa, muchos clusters", title: "Industrias y eventos", industry: "Industria", event: "Evento" },
  en: { new: "New", maps: "Maps", eyebrow: "One map, many clusters", title: "Industries and events", industry: "Industry", event: "Event" },
};

export default function Home() {
  const [lang, setLang] = useState<"es" | "en">("en");
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const toggleLang = useCallback(() => setLang((l) => (l === "es" ? "en" : "es")), []);
  const bt = bannerText[lang];
  const newest = newestCluster();

  return (
    <main>
      {/* Event announcement banner — subtle, dismissable */}
      {!bannerDismissed && newest && (
        <div className="fixed top-0 left-0 right-0 z-[70] bg-[#1a6b4a] text-white">
          <div className="max-w-5xl mx-auto px-6 py-2 flex items-center justify-center gap-3 text-sm">
            <span className="text-[10px] uppercase tracking-wider font-semibold bg-white/20 px-2 py-0.5 rounded-full">{bt.new}</span>
            <span className="text-white/90">
              {newest.name} — {newest.audience[lang]}
            </span>
            <a
              href={newest.href}
              className="text-white font-medium underline underline-offset-2 hover:text-white/80 transition"
            >
              {newest.cta[lang]} &rarr;
            </a>
            <button
              onClick={() => setBannerDismissed(true)}
              className="ml-2 text-white/50 hover:text-white transition"
              aria-label="Dismiss"
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
            </button>
          </div>
        </div>
      )}

      {/* Global nav bar with lang toggle + events */}
      <nav className={`fixed left-0 right-0 z-[60] flex items-center justify-end gap-3 px-6 py-3 transition-all ${bannerDismissed ? "top-0" : "top-[36px]"}`}>
        <a
          href="#clusters"
          className="text-xs bg-white/80 backdrop-blur-sm hover:bg-white text-zinc-600 hover:text-[#1a1a1a] px-3 py-1.5 rounded-full border border-[#ddd8ce] shadow-sm transition font-medium"
        >
          {bt.maps}
        </a>
        <button
          onClick={toggleLang}
          className="text-xs bg-white/80 backdrop-blur-sm hover:bg-white text-zinc-600 hover:text-[#1a1a1a] px-3 py-1.5 rounded-full border border-[#ddd8ce] shadow-sm transition font-medium"
        >
          {lang === "es" ? "EN" : "ES"}
        </button>
      </nav>

      <HeroSection lang={lang} />
      {/* Clusters: every industry and event of the one map, rendered from lib/clusters.ts */}
      <section id="clusters" className="bg-[#f5f3eb] py-20">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs uppercase tracking-[0.2em] text-[#1a6b4a]/60 font-medium mb-3">{bt.eyebrow}</p>
          <h2 className="font-serif text-3xl md:text-4xl text-[#1a1a1a] mb-10">{bt.title}</h2>
          <div className="grid gap-4">
            {CLUSTERS.map((c) => (
              <a
                key={c.slug}
                href={c.href}
                className="group flex items-center justify-between gap-6 bg-white/70 hover:bg-white border border-[#ddd8ce] rounded-2xl px-6 py-5 transition shadow-sm hover:shadow-md"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-serif text-xl text-[#1a1a1a] group-hover:text-[#1a6b4a] transition">{c.name}</h3>
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-[#1a1a1a]/50 border border-[#ddd8ce] px-2 py-0.5 rounded-full">{c.kind === "event" ? bt.event : bt.industry}</span>
                    {c.slug === newest?.slug && <span className="text-[10px] uppercase tracking-wider font-semibold bg-[#1a6b4a] text-white px-2 py-0.5 rounded-full">{bt.new}</span>}
                  </div>
                  <p className="text-sm text-[#1a1a1a]/60 mt-1.5 max-w-2xl">{c.blurb[lang]}</p>
                  <p className="text-xs text-[#1a6b4a] mt-1.5 font-medium">{c.audience[lang]}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {c.stat && <span className="hidden sm:inline text-xs bg-[#1a6b4a]/10 text-[#1a6b4a] px-3 py-1 rounded-full font-medium">{c.stat[lang]}</span>}
                  <svg className="w-5 h-5 text-[#1a1a1a]/30 group-hover:text-[#1a6b4a] transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <HowItWorksSection lang={lang} />
      <PrototypeSection lang={lang} />

      <StatsSection lang={lang} />
      <FooterSection lang={lang} />
    </main>
  );
}
