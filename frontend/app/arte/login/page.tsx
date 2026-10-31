"use client";
import { useState } from "react";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/arte/supabase-browser";

export default function Login() {
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<"idle" | "enviando" | "enviado" | "error">("idle");
  const [error, setError] = useState("");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("enviando");
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/arte/auth/callback` },
    });
    if (error) { setError(error.message); setEstado("error"); } else setEstado("enviado");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Link href="/arte" className="eyebrow">← Arte</Link>
      <h1 className="display mt-6 text-4xl">Entrá a tu estudio</h1>
      <p className="mt-2 text-[var(--ink-2)]">Te mandamos un link a tu mail. Sin contraseñas.</p>
      {estado === "enviado" ? (
        <div className="card mt-8 p-5">
          <p className="font-medium">Listo, revisá tu mail.</p>
          <p className="mt-1 text-sm muted">El link vence en una hora. Si no llega, mirá en spam.</p>
        </div>
      ) : (
        <form onSubmit={enviar} className="mt-8 space-y-3">
          <input className="input" type="email" required placeholder="tu@mail.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
          <button className="btn btn-primary w-full justify-center" disabled={estado === "enviando"}>
            {estado === "enviando" ? "Enviando…" : "Enviarme el link"}
          </button>
          {estado === "error" && <p className="text-sm text-[var(--accent)]">No pudimos enviar el link: {error}</p>}
        </form>
      )}
    </main>
  );
}
