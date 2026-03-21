"use client";

import { useState, useEffect } from "react";

interface WelcomeOverlayProps {
  lang: "es" | "en";
  onDismiss: () => void;
}

const t = {
  es: {
    title: "Green Panorama",
    subtitle: "El mapa interactivo del ecosistema verde argentino",
    line1: "Explora 79+ organizaciones del sector verde, carbono y sustentabilidad de Argentina.",
    line2: "Cada nodo es una empresa, fondo, ONG o startup. Las conexiones muestran quien fondea, se asocia o es cliente de quien.",
    line3: "Los nodos verificados en blockchain tienen datos confirmados por consenso de IA via GenLayer.",
    explore: "Explorar el Mapa",
    ask: "Preguntar al Ecosistema",
  },
  en: {
    title: "Green Panorama",
    subtitle: "Interactive map of Argentina's green ecosystem",
    line1: "Explore 79+ organizations in Argentina's green, carbon, and sustainability sector.",
    line2: "Each node is a company, fund, NGO, or startup. Connections show funding, partnerships, and client relationships.",
    line3: "Blockchain-verified nodes have data confirmed by AI consensus via GenLayer.",
    explore: "Explore the Map",
    ask: "Ask the Ecosystem",
  },
};

export default function WelcomeOverlay({ lang, onDismiss }: WelcomeOverlayProps) {
  const [show, setShow] = useState(false);
  const labels = t[lang];

  useEffect(() => {
    const dismissed = localStorage.getItem("green-panorama-welcome-dismissed");
    if (!dismissed) setShow(true);
  }, []);

  const handleDismiss = (openChat?: boolean) => {
    localStorage.setItem("green-panorama-welcome-dismissed", "true");
    setShow(false);
    onDismiss();
    if (openChat) {
      // Small delay to let the overlay close, then the chat button will be visible
      setTimeout(() => {
        const chatBtn = document.querySelector('[class*="fixed bottom-6 right-6"]') as HTMLButtonElement;
        chatBtn?.click();
      }, 300);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-md w-full p-8 shadow-2xl">
        {/* Logo / Title */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-green-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-green-400">{labels.title}</h1>
          <p className="text-sm text-zinc-400 mt-1">{labels.subtitle}</p>
        </div>

        {/* Info lines */}
        <div className="space-y-3 mb-8">
          <div className="flex gap-3 items-start">
            <span className="w-6 h-6 rounded-full bg-green-900/50 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-green-400" />
            </span>
            <p className="text-sm text-zinc-300">{labels.line1}</p>
          </div>
          <div className="flex gap-3 items-start">
            <span className="w-6 h-6 rounded-full bg-blue-900/50 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
            </span>
            <p className="text-sm text-zinc-300">{labels.line2}</p>
          </div>
          <div className="flex gap-3 items-start">
            <span className="w-6 h-6 rounded-full bg-amber-900/50 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
            </span>
            <p className="text-sm text-zinc-300">{labels.line3}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => handleDismiss(false)}
            className="flex-1 bg-green-600 hover:bg-green-500 text-white font-medium py-2.5 rounded-xl transition text-sm"
          >
            {labels.explore}
          </button>
          <button
            onClick={() => handleDismiss(true)}
            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium py-2.5 rounded-xl transition text-sm border border-zinc-600"
          >
            {labels.ask}
          </button>
        </div>
      </div>
    </div>
  );
}
