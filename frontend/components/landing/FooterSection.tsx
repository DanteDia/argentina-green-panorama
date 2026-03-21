const t = {
  es: {
    tagline: "Un bien publico para el mapeo transparente de industrias",
    built: "Construido en",
    verifiedBy: "Verificacion impulsada por",
    opensource: "Verifiable Industries es un bien publico de codigo abierto.",
  },
  en: {
    tagline: "A public good for transparent industry mapping",
    built: "Built at",
    verifiedBy: "Verification powered by",
    opensource: "Verifiable Industries is an open-source public good.",
  },
};

export default function FooterSection({ lang = "en" }: { lang?: "es" | "en" }) {
  const labels = t[lang];

  return (
    <footer className="bg-[#1a1a1a] text-white/70 py-16">
      <div className="max-w-5xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="text-center md:text-left">
            <h3 className="font-serif text-xl text-white mb-1">Verifiable Industries</h3>
            <p className="text-sm text-white/40">{labels.tagline}</p>
          </div>

          <div className="text-center text-sm space-y-1">
            <p>
              {labels.built}{" "}
              <a href="https://dorahacks.io/hackathon/alephhackathonm26" target="_blank" rel="noopener" className="text-white hover:text-[#1a6b4a] transition underline underline-offset-2">
                Aleph Hackathon
              </a>{" "}
              &middot; March 2026
            </p>
            <p className="text-white/40">
              {labels.verifiedBy}{" "}
              <a href="https://genlayer.com" target="_blank" rel="noopener" className="text-white/60 hover:text-white transition">
                GenLayer
              </a>
            </p>
          </div>

          <div className="flex gap-6 text-sm">
            <a href="https://github.com/DanteDia/argentina-green-panorama" target="_blank" rel="noopener" className="text-white/50 hover:text-white transition">GitHub</a>
            <a href="https://dorahacks.io/hackathon/alephhackathonm26" target="_blank" rel="noopener" className="text-white/50 hover:text-white transition">DoraHacks</a>
            <a href="https://studio.genlayer.com" target="_blank" rel="noopener" className="text-white/50 hover:text-white transition">GenLayer Studio</a>
          </div>
        </div>

        <div className="border-t border-white/10 mt-10 pt-6 text-center text-xs text-white/30">
          {labels.opensource}
        </div>
      </div>
    </footer>
  );
}
