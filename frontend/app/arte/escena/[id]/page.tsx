// Public page of one space or person in the art scene map: who they work with, recent shows, and a way for the people
// behind it to join as co-authors of the map. Contact data in the map is never shown here.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { supabase } from "@/lib/supabase";
import { contactLines, decodeEntities, PUBLIC_CATEGORIES, publicLink, redactContacts, relationSections, SHOWN_TYPES, UUID } from "@/lib/arte/escena";
import { formatDay } from "@/lib/arte/dates";
import { claimNode } from "../actions";

type Node = { id: string; nombre: string; cluster: string | null; categoria: string | null; link: string | null; descripcion: string | null; contact_info: Record<string, unknown> | null };
const SHOW = 60;

// one query per request even though metadata and the page both ask
const load = cache(async (id: string) => {
  if (!supabase || !UUID.test(id)) return null;
  const { data } = await supabase.from("nodes").select("id, nombre, cluster, categoria, link, descripcion, contact_info")
    .eq("id", id).overlaps("industries", ["arte"]).in("categoria", PUBLIC_CATEGORIES).maybeSingle();
  return data as Node | null;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const n = await load((await params).id);
  return n ? { title: `${decodeEntities(n.nombre)} en la escena del arte argentino · Arte`, description: `${n.cluster ?? ""}: con quién trabaja, muestras y vínculos en el mapa de la escena.` } : {};
}

export default async function Ficha({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const n = await load(id);
  if (!n || !supabase) notFound();
  const [{ data: edges }, { data: events }] = await Promise.all([
    supabase.from("edges").select("source_id, target_id, relationship_type").or(`source_id.eq.${id},target_id.eq.${id}`).in("relationship_type", SHOWN_TYPES).limit(2000),
    supabase.from("arte_events").select("id, title, starts_on, url").eq("venue_node_id", id).order("starts_on", { ascending: false }).limit(8),
  ]);
  const ids = [...new Set((edges || []).flatMap((e) => [e.source_id, e.target_id]))].filter((x) => x !== id);
  const names = new Map<string, string>();
  const chunks = Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => ids.slice(i * 100, i * 100 + 100));   // a long id list overflows the URL
  const pages = await Promise.all(chunks.map((c) => supabase!.from("nodes").select("id, nombre").in("id", c).overlaps("industries", ["arte"]).in("categoria", PUBLIC_CATEGORIES)));
  for (const { data } of pages) for (const r of data || []) names.set(r.id, decodeEntities(r.nombre));
  const sections = relationSections(id, edges || [], names);
  const site = publicLink(n.link);
  const contacto = contactLines(n.contact_info);
  const nombre = decodeEntities(n.nombre);
  const bio = n.descripcion ? redactContacts(decodeEntities(n.descripcion)) : "";

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 md:py-16">
      <Link href="/arte/escena" className="eyebrow">← La escena</Link>
      <p className="mt-8 text-sm muted">{n.cluster}</p>
      <h1 className="display mt-1 text-4xl md:text-5xl">{nombre}</h1>
      {bio && <p className="mt-3 max-w-2xl text-[var(--ink-2)]">{bio}</p>}
      {site && <a href={site} target="_blank" rel="noopener noreferrer nofollow" className="mt-3 inline-block text-sm underline">{site.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a>}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {contacto.length > 0 && (
            <section className="card p-5">
              <h2 className="eyebrow">Contacto</h2>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {contacto.map((c, i) => (
                  <div key={i} className="contents">
                    <dt className="muted">{c.label}</dt>
                    <dd className="min-w-0 break-words">{c.href ? <a href={c.href} className="underline" rel="nofollow">{c.text}</a> : c.text}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {sections.map((s) => (
            <section key={s.title} className="card p-5">
              <h2 className="eyebrow">{s.title} · {s.items.length}</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {s.items.slice(0, SHOW).map((i) => <li key={i.id}><Link href={`/arte/escena/${i.id}`} className="pill hover:bg-white">{i.name}</Link></li>)}
                {s.items.length > SHOW && <li className="pill">y {s.items.length - SHOW} más</li>}
              </ul>
            </section>
          ))}
          {!sections.length && <p className="card p-5 muted">Todavía no tenemos vínculos cargados para esta ficha.</p>}
          {!!events?.length && (
            <section className="card p-5">
              <h2 className="eyebrow">Muestras y actividades</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {events.map((e) => (
                  <li key={e.id}>{e.starts_on && <span className="muted">{formatDay(e.starts_on)} · </span>}
                    {e.url ? <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="underline">{e.title}</a> : e.title}</li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside id="sumate" className="card-deep h-fit p-5 lg:sticky lg:top-6">
          <h2 className="display text-xl">¿Sos parte de {nombre}?</h2>
          <p className="mt-2 text-sm opacity-90">Este mapa lo armamos con fuentes públicas. Sumate como coautor: corregí la ficha, sumá a tus artistas y tus muestras, y aparecé ante los artistas que buscan dónde mostrar.</p>
          {sp.gracias ? (
            <p className="mt-4 text-sm font-medium">¡Gracias! Te escribimos en estos días.</p>
          ) : (
            <form action={claimNode} className="mt-4 space-y-2">
              <input type="hidden" name="node_id" value={n.id} />
              <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
              <input name="name" required placeholder="Tu nombre" className="input !text-[var(--ink)]" aria-label="Tu nombre" />
              <input name="email" type="email" required placeholder="Tu mail" className="input !text-[var(--ink)]" aria-label="Tu mail" />
              <select name="role" className="input !text-[var(--ink)]" aria-label="Tu rol" defaultValue="">
                <option value="" disabled>Tu rol</option>
                <option>Trabajo en este espacio</option><option>Soy esta persona</option><option>Curaduría</option><option>Otro</option>
              </select>
              <textarea name="message" rows={3} placeholder="¿Qué querés corregir o sumar? (opcional)" className="input !text-[var(--ink)]" aria-label="Mensaje" />
              {sp.falta && <p className="text-sm">Falta tu nombre o un mail válido.</p>}
              {sp.error && <p className="text-sm">No pudimos guardarlo, probá de nuevo.</p>}
              <button className="btn w-full justify-center bg-white text-[var(--accent)]">Sumarme</button>
            </form>
          )}
        </aside>
      </div>
    </main>
  );
}
