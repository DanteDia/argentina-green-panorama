const t = {
  es: {
    arch: "Arquitectura",
    title: "Como Funciona",
    pillars: [
      { title: "Agentes de IA Investigadores", description: "Agentes autonomos descubren empresas, mapean relaciones y enriquecen datos las 24 horas. Nuevos actores y conexiones aparecen en tiempo real." },
      { title: "Verificacion Blockchain", description: "Contratos inteligentes de GenLayer verifican cada dato. Multiples validadores de IA alcanzan consenso antes de marcar la informacion como confiable." },
      { title: "Mapa en Vivo", description: "Un grafo interactivo que crece cada dia. Hace preguntas en lenguaje natural. Explora conexiones. Confia en los datos." },
    ],
  },
  en: {
    arch: "Architecture",
    title: "How It Works",
    pillars: [
      { title: "AI Research Agents", description: "Autonomous agents discover companies, map relationships, and enrich data around the clock. New actors and connections appear in real-time." },
      { title: "Blockchain Verification", description: "GenLayer intelligent contracts verify every data point. Multiple AI validators reach consensus before marking information as trusted." },
      { title: "Living Map", description: "An interactive, queryable graph that grows every day. Ask questions in natural language. Explore connections. Trust the data." },
    ],
  },
};

const ICONS = [
  <svg key="1" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1a6b4a" strokeWidth="1.5">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
  </svg>,
  <svg key="2" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1a6b4a" strokeWidth="1.5">
    <path d="M9 12l2 2 4-4" />
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M3 9h18M9 3v18" />
  </svg>,
  <svg key="3" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1a6b4a" strokeWidth="1.5">
    <circle cx="6" cy="6" r="2" />
    <circle cx="18" cy="6" r="2" />
    <circle cx="12" cy="18" r="2" />
    <path d="M6 8v2a4 4 0 004 4h0M18 8v2a4 4 0 01-4 4h0" />
  </svg>,
];

export default function HowItWorksSection({ lang = "en" }: { lang?: "es" | "en" }) {
  const labels = t[lang];

  return (
    <section id="how-it-works" className="py-28 md:py-36 bg-[#f5f3eb]">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-20">
          <p className="text-sm font-mono font-medium text-[#1a6b4a] tracking-widest uppercase mb-4">
            {labels.arch}
          </p>
          <h2 className="font-serif text-4xl md:text-5xl font-semibold text-[#1a1a1a] tracking-tight">
            {labels.title}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {labels.pillars.map((pillar, i) => (
            <div
              key={i}
              className="bg-white rounded-lg overflow-hidden border border-[#1a1a1a]/5 hover:shadow-lg transition-shadow duration-300"
            >
              <div className="h-[2px] bg-gradient-to-r from-[#1a6b4a]/60 to-[#1a6b4a]/10" />
              <div className="p-8">
                <span className="font-mono text-xs text-[#1a6b4a]/50 tracking-widest mb-4 block">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="w-12 h-12 rounded-lg bg-[#1a6b4a]/8 flex items-center justify-center mb-5">
                  {ICONS[i]}
                </div>
                <h3 className="text-lg font-semibold text-[#1a1a1a] mb-3">{pillar.title}</h3>
                <p className="text-[#1a1a1a]/55 text-sm leading-relaxed">{pillar.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
