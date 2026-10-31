"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [["/arte/perfil", "Datos y textos"], ["/arte/perfil/obras", "Obras"], ["/arte/perfil/cv", "CV"]] as const;

export function ProfileTabs() {
  const path = usePathname();
  return (
    <div className="mt-6 flex gap-2 border-b border-[var(--line)]">
      {TABS.map(([href, label]) => (
        <Link key={href} href={href} className={`-mb-px border-b-2 px-3 py-2 text-sm ${path === href ? "border-[var(--ink)] font-medium" : "border-transparent muted hover:text-[var(--ink)]"}`}>{label}</Link>
      ))}
    </div>
  );
}

export function Meter({ score, missing }: { score: number; missing: string[] }) {
  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Tu perfil para postular</p>
        <p className="display text-3xl">{score}%</p>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-[var(--paper-2)]"><div className="h-1.5 rounded-full bg-[var(--ink)]" style={{ width: `${score}%` }} /></div>
      {missing.length > 0 && <p className="mt-3 text-sm text-[var(--ink-2)]">Siguiente: <span className="font-medium">{missing[0]}</span>{missing.length > 1 && <span className="muted"> · y {missing.length - 1} más</span>}</p>}
    </div>
  );
}
