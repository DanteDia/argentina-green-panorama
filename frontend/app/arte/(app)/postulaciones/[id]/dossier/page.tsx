import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/arte/supabase-server";
import { loadStudio, signedUrls } from "@/lib/arte/data";
import { assembleDossier } from "@/lib/arte/dossier";
import { DossierEditor } from "@/components/arte/DossierEditor";
import type { Program } from "@/lib/arte/types";
import type { DossierDraft } from "./actions";

export default async function DossierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, supabase } = await requireUser();
  const { data: app } = await supabase.from("arte_applications").select("dossier, arte_programs(*)").eq("id", id).maybeSingle();
  if (!app) notFound();
  const studio = await loadStudio(supabase, user.id);
  if (!studio.profile) redirect("/arte/onboarding");
  const program = app.arte_programs as unknown as Program;
  const saved = (app.dossier || {}) as Partial<DossierDraft>;
  const d = assembleDossier({ profile: studio.profile, works: studio.works, cv: studio.cv, texts: studio.texts, program }, saved);
  const withImages = studio.works.filter((w) => w.images.length);
  const thumbs = await signedUrls(supabase, withImages.map((w) => w.images[0]));

  return (
    <div className="max-w-5xl">
      <Link href={`/arte/postulaciones/${id}`} className="eyebrow">← {program.name}</Link>
      <h1 className="display mt-3 text-4xl">Tu dossier</h1>
      <p className="mt-2 muted">
        {[d.limits.images_max && `${d.limits.images_max} imágenes`, d.limits.mb_max && `hasta ${d.limits.mb_max} MB`, d.limits.pages_max && `hasta ${d.limits.pages_max} páginas`].filter(Boolean).join(" · ") || "Sin límites declarados en las bases"}
        {" · "}se descarga como <span className="text-[var(--ink)]">{d.fileName}</span>
      </p>
      <DossierEditor
        applicationId={id}
        initial={{ letter: d.sections.letter, bio: d.sections.bio, statement: d.sections.statement, workIds: d.sections.works.map((w) => w.id), template: saved.template ?? "editorial" }}
        works={withImages.map((w) => ({ id: w.id, title: w.title, year: w.year, thumb: thumbs[w.images[0]] ?? null }))}
        maxWorks={d.limits.images_max ?? 8}
      />
    </div>
  );
}
