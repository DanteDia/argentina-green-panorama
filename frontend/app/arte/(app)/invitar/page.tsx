import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/arte/supabase-server";
import { loadStudio } from "@/lib/arte/data";
import { loadDiscover } from "@/lib/arte/discover-data";
import { affineArtists, affinePeople, affineVenues, yourVenues } from "@/lib/arte/discover";
import { inviteCandidates, type Show } from "@/lib/arte/invite";
import { InviteList, type Sent } from "@/components/arte/InviteList";
import { saveShow } from "./actions";

function ShowForm({ show }: { show: Show | null }) {
  return (
    <form action={saveShow} className="card grid gap-3 p-4 md:grid-cols-2">
      {show && <input type="hidden" name="id" value={show.id} />}
      <input className="input md:col-span-2" name="title" placeholder="Nombre de la muestra" aria-label="Nombre de la muestra" defaultValue={show?.title} required />
      <input className="input" name="venue" placeholder="Espacio (ej. Acéfala Galería)" aria-label="Espacio" defaultValue={show?.venue ?? ""} />
      <input className="input" name="address" placeholder="Dirección" aria-label="Dirección" defaultValue={show?.address ?? ""} />
      <input className="input" name="when_text" placeholder="Cuándo (ej. jueves 12/11, 18 a 21 h)" aria-label="Cuándo" defaultValue={show?.when_text ?? ""} />
      <input className="input" name="link" type="url" placeholder="Link (opcional)" aria-label="Link" defaultValue={show?.link ?? ""} />
      <textarea className="input min-h-20 md:col-span-2" name="note" placeholder="Una línea tuya sobre la muestra (opcional)" aria-label="Nota" defaultValue={show?.note ?? ""} />
      <div className="md:col-span-2 flex justify-end"><button className="btn btn-primary">{show ? "Guardar cambios" : "Crear muestra"}</button></div>
    </form>
  );
}

export default async function Invitar({ searchParams }: { searchParams: Promise<{ muestra?: string; editar?: string; nueva?: string }> }) {
  const { muestra, editar, nueva } = await searchParams;
  const { user, supabase } = await requireUser();
  const studio = await loadStudio(supabase, user.id);
  if (!studio.profile) redirect("/arte/onboarding");
  const profile = studio.profile;

  const { data: shows } = await supabase.from("arte_shows").select("id, title, venue, address, when_text, link, note").order("created_at", { ascending: false });
  const show = ((shows || []) as Show[]).find((s) => s.id === muestra) ?? (shows?.[0] as Show | undefined) ?? null;

  const head = (
    <>
      <p className="eyebrow">Invitar</p>
      <h1 className="display mt-2 text-4xl">Invitá a tu muestra</h1>
      <p className="mt-2 muted">Te sugerimos espacios, curadores, coleccionistas y artistas de tu escena. Cada invitación se abre lista en tu Gmail o como DM de Instagram, y la mandás vos.</p>
    </>
  );
  if (!show || editar !== undefined || nueva !== undefined) return <div className="max-w-5xl">{head}<div className="mt-8"><ShowForm show={editar !== undefined ? show : null} /></div></div>;

  const ctx = await loadDiscover(supabase, user.id, profile, studio.cv);
  const { data: inv } = await supabase.from("arte_invites").select("id, key, name, email, instagram").eq("show_id", show.id).order("sent_at", { ascending: false });
  const guests = inviteCandidates([yourVenues(ctx), affineVenues(ctx), affinePeople(ctx), affineArtists(ctx)], ctx.rows, new Set((inv || []).map((i) => i.key))).slice(0, 40)
    .map(({ nodeId, name, kind, reasons, contact }) => ({ nodeId, name, kind, reasons, contact }));

  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const link = profile.website ?? (profile.portfolio_public && profile.slug ? `${origin}/arte/a/${profile.slug}` : null);

  return (
    <div className="max-w-5xl">
      {head}
      <div className="card mt-8 flex flex-wrap items-baseline justify-between gap-3 p-4">
        <div>
          <p className="display text-xl">{show.title}</p>
          <p className="text-sm muted">{[show.venue, show.when_text, show.address].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex gap-3 text-sm">
          {(shows?.length ?? 0) > 1 && (shows as Show[]).filter((s) => s.id !== show.id).slice(0, 3).map((s) => <Link key={s.id} href={`/arte/invitar?muestra=${s.id}`} className="underline muted">{s.title}</Link>)}
          <Link href={`/arte/invitar?muestra=${show.id}&editar`} className="underline">Editar</Link>
          <Link href="/arte/invitar?nueva" className="underline">Nueva muestra</Link>
        </div>
      </div>
      <div className="mt-8">
        <InviteList show={show} guests={guests} sent={(inv || []) as Sent[]} from={{ name: profile.name, link }} />
      </div>
    </div>
  );
}
