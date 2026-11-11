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

export function Meter({ score, todo }: { score: number; todo: { label: string; href: string }[] }) {
  return (
    <div className="card p-5">
      {/* the score and bar are the obvious click target: send them to the next thing to complete */}
      <Link href={todo[0]?.href ?? "/arte/perfil"} className="block" aria-label={`Completar perfil: ${score}%`}>
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">Tu perfil para postular</p>
          <p className="display text-3xl">{score}%</p>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-[var(--paper-2)]"><div className="h-1.5 rounded-full bg-[var(--ink)]" style={{ width: `${score}%` }} /></div>
      </Link>
      {todo.length > 0 && (
        <p className="mt-3 text-sm text-[var(--ink-2)]">Siguiente: <Link href={todo[0].href} className="font-medium underline decoration-[var(--line)] underline-offset-4 hover:decoration-[var(--ink)]">{todo[0].label} →</Link></p>
      )}
      {todo.length > 1 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer muted">y {todo.length - 1} más</summary>
          <ul className="mt-2 space-y-1">
            {todo.slice(1).map((t) => <li key={t.label}><Link href={t.href} className="hover:underline">→ {t.label}</Link></li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
