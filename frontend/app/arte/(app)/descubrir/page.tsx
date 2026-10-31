import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/arte/supabase-server";
import { loadStudio } from "@/lib/arte/data";
import { loadDiscover } from "@/lib/arte/discover-data";
import { affineArtists, affineVenues, type Affine } from "@/lib/arte/discover";

const KIND: Record<string, string> = { galeria: "Galería", museo: "Museo", institucion: "Institución", fundacion: "Fundación", programa: "Programa", artista: "Artista" };

function Lista({ items, rows }: { items: Affine[]; rows: Map<string, { link: string | null; descripcion: string | null }> }) {
  return (
    <ul className="mt-3 grid gap-3 md:grid-cols-2">
      {items.map((a) => {
        const r = rows.get(a.nodeId);
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3"><span className="display text-lg leading-snug">{a.name}</span><span className="shrink-0 text-xs muted">{KIND[a.kind] ?? a.kind}</span></div>
            {r?.descripcion && <p className="mt-1 line-clamp-2 text-sm text-[var(--ink-2)]">{r.descripcion}</p>}
            <ul className="mt-2 space-y-0.5 text-sm">{a.reasons.slice(0, 3).map((x) => <li key={x} className="flex gap-2"><span className="text-[var(--accent)]">→</span>{x}</li>)}</ul>
          </>
        );
        return <li key={a.nodeId}>{r?.link ? <a href={r.link} target="_blank" rel="noreferrer" className="card block p-4 hover:shadow-sm">{body}</a> : <div className="card p-4">{body}</div>}</li>;
      })}
    </ul>
  );
}

export default async function Descubrir() {
  const { user, supabase } = await requireUser();
  const studio = await loadStudio(supabase, user.id);
  if (!studio.profile) redirect("/arte/onboarding");
  const ctx = await loadDiscover(supabase, user.id, studio.profile, studio.cv);
  const artists = affineArtists(ctx).slice(0, 24);
  const venues = affineVenues(ctx).slice(0, 16);
  const vacio = !ctx.follows.length && !studio.profile.node_id && !studio.profile.themes.length;

  return (
    <div className="max-w-5xl">
      <p className="eyebrow">Descubrir</p>
      <h1 className="display mt-2 text-4xl">Tu escena</h1>
      <p className="mt-2 muted">Artistas y espacios cercanos a tu práctica, a partir de a quién seguís, dónde expusiste y de qué trata tu obra.</p>
      {vacio && <p className="card mt-6 p-5 text-sm">Conectá tu Instagram en el <Link href="/arte/onboarding" className="underline">onboarding</Link> o agregá temas en tu <Link href="/arte/perfil" className="underline">perfil</Link> para ver recomendaciones.</p>}
      {venues.length > 0 && <section className="mt-8"><h2 className="display text-2xl">Espacios para acercarte</h2><Lista items={venues} rows={ctx.rows} /></section>}
      {artists.length > 0 && <section className="mt-10"><h2 className="display text-2xl">Artistas afines</h2><Lista items={artists} rows={ctx.rows} /></section>}
      <p className="mt-10 text-sm muted">¿Querés verlo como red? <Link href="/arte/mapa" className="underline">Abrí el mapa</Link>.</p>
    </div>
  );
}
