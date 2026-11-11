import Link from "next/link";

/** Shown once per page while the artist hasn't said what their work is about: matching is generic until then. */
export function StatementNotice({ className = "" }: { className?: string }) {
  return (
    <p className={`text-sm ${className}`}>Todavía no sabemos de qué va tu obra, así que lo que te recomendamos es general. <Link href="/arte/perfil#textos" className="underline">Escribí tu statement</Link> (dos líneas alcanzan: las ordenamos por vos) y se afina.</p>
  );
}
