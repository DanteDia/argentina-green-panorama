"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

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
  const ref = useRef<HTMLElement>(null);
  // on a phone the bar scrolls sideways: bring the current section into view, so the bar opens where the artist is
  useEffect(() => {
    ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [path]);
  return (
    <nav ref={ref} className="arte-nav flex min-w-0 gap-1 overflow-x-auto px-1 py-1" aria-label="Secciones">
      {ITEMS.map(([href, label]) => {
        const on = path === href || path.startsWith(href + "/");
        return (
          <Link key={href} href={href}
            aria-current={on ? "page" : undefined}
            className={`whitespace-nowrap rounded-full px-3.5 py-2 text-sm ${on ? "bg-[var(--ink)] font-medium text-[#f1f7f2]" : "text-[var(--ink-2)] hover:bg-white/70"}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
