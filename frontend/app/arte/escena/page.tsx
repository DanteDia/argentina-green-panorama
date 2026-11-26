// Public: the art scene map as a directory. No account needed; only what the map shows publicly.
import type { Metadata } from "next";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { escapeLike } from "@/lib/arte/guards";
import { decodeEntities, PUBLIC_CATEGORIES } from "@/lib/arte/escena";

export const metadata: Metadata = {
  title: "La escena del arte argentino · Arte",
  description: "Galerías, museos, espacios, artistas y curadores de la escena argentina, y quién trabaja con quién.",
};

const TIPOS = [["", "Espacios"], ["galeria", "Galerías"], ["museo", "Museos"], ["espacio", "Espacios independientes"], ["artista", "Artistas"], ["curador", "Curaduría"]] as const;
const SPACES = ["galeria", "museo", "espacio", "centro_cultural", "fundacion", "institucion"];

type Row = { id: string; nombre: string; cluster: string | null; categoria: string | null };

export default async function Escena({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = (sp.q || "").trim().slice(0, 80);
  let rows: Row[] = [];
  if (supabase) {
    let query = supabase.from("nodes").select("id, nombre, cluster, categoria").overlaps("industries", ["arte"]);
    const tipo = sp.tipo && PUBLIC_CATEGORIES.includes(sp.tipo) ? sp.tipo : null;
    query = tipo ? query.eq("categoria", tipo) : query.in("categoria", q ? PUBLIC_CATEGORIES : SPACES);
    if (q) query = query.ilike("nombre", `%${escapeLike(q)}%`);
    const { data } = await query.order("followers", { ascending: false, nullsFirst: false }).limit(q ? 60 : 48);
    rows = (data as Row[]) || [];
  }
  const href = (tipo: string) => `/arte/escena?${new URLSearchParams({ ...(q ? { q } : {}), ...(tipo ? { tipo } : {}) })}`;

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 md:py-16">
      <div className="flex items-center justify-between">
        <Link href="/arte" className="eyebrow">← Arte</Link>
        <Link href="/arte/login" className="btn btn-ghost">Entrar</Link>
      </div>
      <h1 className="display mt-8 text-4xl md:text-5xl">La escena del arte argentino</h1>
      <p className="mt-3 max-w-2xl text-[var(--ink-2)]">
        Más de 6.000 galerías, museos, espacios, artistas y curadores, y quién trabaja con quién. Lo armamos con fuentes públicas y lo
        mantenemos al día cada semana. Si sos parte de un espacio, podés sumarte a corregirlo.
      </p>
      <form className="mt-6 flex gap-2">
        {sp.tipo && <input type="hidden" name="tipo" value={sp.tipo} />}
        <input name="q" defaultValue={q} placeholder="Buscar una galería, un museo, un artista…" className="input" aria-label="Buscar en la escena" />
        <button className="btn btn-primary shrink-0">Buscar</button>
      </form>
      <div className="mt-4 flex flex-wrap gap-2">
        {TIPOS.map(([v, l]) => (
          <Link key={v} href={href(v)} aria-current={(sp.tipo || "") === v ? "page" : undefined}
            className={`pill ${(sp.tipo || "") === v ? "bg-[var(--ink)] text-[#f1f7f2] border-transparent" : ""}`}>{l}</Link>
        ))}
      </div>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={`/arte/escena/${r.id}`} className="card block p-4 transition hover:shadow-sm">
              <p className="font-medium leading-snug">{decodeEntities(r.nombre)}</p>
              {r.cluster && <p className="mt-1 text-sm muted">{r.cluster}</p>}
            </Link>
          </li>
        ))}
      </ul>
      {!rows.length && <p className="card mt-6 p-6 muted">No encontramos a nadie con ese nombre. Probá con una parte del nombre.</p>}
      <p className="mt-10 text-sm muted">¿Aparecés en el mapa? <Link href="/arte/datos" className="underline">Cómo armamos estos datos y cómo pedir una corrección o una baja</Link>.</p>
    </main>
  );
}
