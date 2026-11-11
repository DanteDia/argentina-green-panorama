"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  ["/arte/hoy", "Hoy"],
  ["/arte/oportunidades", "Oportunidades"],
  ["/arte/plan", "Plan"],
  ["/arte/postulaciones", "Postulaciones"],
  ["/arte/perfil", "Perfil"],
  ["/arte/descubrir", "Descubrir"],
  ["/arte/invitar", "Invitar"],
  ["/arte/mapa", "Mapa"],
] as const;

export function Nav() {
  const path = usePathname();
  return (
    <nav className="mt-4 flex flex-wrap gap-1 md:mt-6 md:flex-col md:flex-nowrap" aria-label="Secciones">
      {ITEMS.map(([href, label]) => {
        const on = path === href || path.startsWith(href + "/");
        return (
          <Link key={href} href={href}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${on ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--ink-2)] hover:bg-[var(--paper-2)]"}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
