"use client";

import { useState, useCallback } from "react";
import HeroSection from "@/components/landing/HeroSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import PrototypeSection from "@/components/landing/PrototypeSection";
import StatsSection from "@/components/landing/StatsSection";
import FooterSection from "@/components/landing/FooterSection";

const EVENTS = [
  { slug: "blockchainrio-2026", name: "BlockchainRio 2026", date: "Aug 5-7", location: "Rio de Janeiro" },
];

const bannerText = {
  es: { new: "Nuevo", cta: "Ver mapa", events: "Eventos" },
  en: { new: "New", cta: "View map", events: "Events" },
};

export default function Home() {
  const [lang, setLang] = useState<"es" | "en">("en");
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const toggleLang = useCallback(() => setLang((l) => (l === "es" ? "en" : "es")), []);
  const bt = bannerText[lang];

  return (
    <main>
      {/* Event announcement banner — subtle, dismissable */}
      {!bannerDismissed && (
        <div className="fixed top-0 left-0 right-0 z-[70] bg-[#1a6b4a] text-white">
          <div className="max-w-5xl mx-auto px-6 py-2 flex items-center justify-center gap-3 text-sm">
            <span className="text-[10px] uppercase tracking-wider font-semibold bg-white/20 px-2 py-0.5 rounded-full">{bt.new}</span>
            <span className="text-white/90">
              BlockchainRio 2026 — 65+ companies mapped
            </span>
            <a
              href="/event/blockchainrio-2026"
              className="text-white font-medium underline underline-offset-2 hover:text-white/80 transition"
            >
              {bt.cta} &rarr;
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
          href="#events"
          className="text-xs bg-white/80 backdrop-blur-sm hover:bg-white text-zinc-600 hover:text-[#1a1a1a] px-3 py-1.5 rounded-full border border-[#ddd8ce] shadow-sm transition font-medium"
        >
          {bt.events}
        </a>
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

      {/* Events Section */}
      <section id="events" className="bg-[#f5f3eb] py-20">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs uppercase tracking-[0.2em] text-[#1a6b4a]/60 font-medium mb-3">
            {lang === "es" ? "Eventos cubiertos" : "Events covered"}
          </p>
          <h2 className="font-serif text-3xl md:text-4xl text-[#1a1a1a] mb-10">
            {lang === "es" ? "Mapas de eventos" : "Event Maps"}
          </h2>
          <div className="grid gap-4">
            {EVENTS.map((event) => (
              <a
                key={event.slug}
                href={`/event/${event.slug}`}
                className="group flex items-center justify-between bg-white/70 hover:bg-white border border-[#ddd8ce] rounded-2xl px-6 py-5 transition shadow-sm hover:shadow-md"
              >
                <div>
                  <h3 className="font-serif text-xl text-[#1a1a1a] group-hover:text-[#1a6b4a] transition">{event.name}</h3>
                  <p className="text-sm text-[#1a1a1a]/40 mt-1">{event.date} &middot; {event.location}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-[#1a6b4a]/10 text-[#1a6b4a] px-3 py-1 rounded-full font-medium">
                    65+ {lang === "es" ? "actores" : "actors"}
                  </span>
                  <svg className="w-5 h-5 text-[#1a1a1a]/30 group-hover:text-[#1a6b4a] transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <StatsSection lang={lang} />
      <FooterSection lang={lang} />
    </main>
  );
}
