import Link from "next/link";
import type { Ranked } from "@/lib/arte/match";

const TONO: Record<string, string> = {
  abierta: "bg-[#e3ecdf] text-[var(--ok)]", "cierra hoy": "bg-[var(--accent-soft)] text-[var(--accent)]",
  próxima: "bg-[#efe6d0] text-[var(--warn)]", recurrente: "bg-[var(--paper-2)] text-[var(--ink-2)]", cerrada: "bg-[var(--paper-2)] text-[var(--ink-3)]",
};

export function ProgramCard({ r, compact = false }: { r: Ranked; compact?: boolean }) {
  const p = r.program;
  const urgente = r.state.label === "cierra hoy" || (r.state.label === "abierta" && (r.state.daysLeft ?? 99) <= 7);
  return (
    <Link href={`/arte/oportunidades/${encodeURIComponent(p.id)}`} className="card block p-5 transition hover:shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`pill border-transparent ${TONO[r.state.label]}`}>{r.state.label}</span>
            {p.type && <span className="pill">{p.type}</span>}
            {p.digital_focus && <span className="pill">arte y tecnología</span>}
            {p.country && <span className="text-xs muted">{p.country}</span>}
          </div>
          <h3 className="display mt-2 text-xl leading-snug">{p.name}</h3>
          {p.organizer && <p className="text-sm muted">{p.organizer}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="display text-3xl leading-none">{r.score}</p>
          <p className="text-[10px] uppercase tracking-wider muted">afinidad</p>
        </div>
      </div>
      <p className={`mt-3 text-sm ${urgente ? "text-[var(--accent)] font-medium" : "text-[var(--ink-2)]"}`}>{r.state.text}</p>
      {!compact && p.benefit && <p className="mt-1 line-clamp-2 text-sm text-[var(--ink-2)]">{p.benefit}</p>}
      <ul className="mt-3 space-y-1 text-sm">
        {r.reasons.slice(0, compact ? 2 : 3).map((x) => <li key={x} className="flex gap-2"><span className="text-[var(--accent)]">→</span><span>{x}</span></li>)}
      </ul>
      {!compact && <p className="mt-3 text-xs muted">~{r.effortDays} días de preparación · Fuente: {(p.source || "—").replace(/\s*\(https?:[^)]*\)/, "")}{p.verified_at ? ` · verificado ${p.verified_at}` : ""}</p>}
    </Link>
  );
}
