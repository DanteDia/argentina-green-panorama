import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import { renderToBuffer } from "@react-pdf/renderer";
import { createServerSupabase } from "@/lib/arte/supabase-server";
import { loadStudio, signedUrls } from "@/lib/arte/data";
import { assembleDossier } from "@/lib/arte/dossier";
import { DossierDocument, type PdfWork, type Template } from "@/lib/arte/pdf/DossierDocument";
import type { Program } from "@/lib/arte/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Fit one image under `budget` bytes: shrink side and quality until it fits (JPEG). */
async function fit(buf: ArrayBuffer, budget: number): Promise<Buffer | null> {
  for (const [side, q] of [[2000, 85], [1600, 80], [1300, 75], [1000, 70], [800, 62], [600, 55]] as const) {
    const out = await sharp(Buffer.from(buf)).rotate().resize(side, side, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: q, mozjpeg: true }).toBuffer();
    if (out.length <= budget) return out;
  }
  return null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "no autenticado" }, { status: 401 });
  const { data: app } = await supabase.from("arte_applications").select("dossier, arte_programs(*)").eq("id", applicationId).maybeSingle();
  if (!app) return NextResponse.json({ error: "no existe" }, { status: 404 });

  const studio = await loadStudio(supabase, auth.user.id);
  if (!studio.profile) return NextResponse.json({ error: "completá tu perfil" }, { status: 400 });
  const program = app.arte_programs as unknown as Program;
  const saved = (app.dossier || {}) as { letter?: string; bio?: string; statement?: string; workIds?: string[]; template?: Template };
  const d = assembleDossier({ profile: studio.profile, works: studio.works, cv: studio.cv, texts: studio.texts, program }, saved);

  const template = (request.nextUrl.searchParams.get("template") as Template) || saved.template || "editorial";
  // Images get the size budget; without a stated limit we still keep files mailable (~15 MB)
  const budget = d.limits.image_budget_bytes ?? 15 * 1024 * 1024;
  const perImage = Math.floor(budget / Math.max(1, d.sections.works.length));
  const urls = await signedUrls(supabase, d.sections.works.map((w) => w.images[0]));
  const works: PdfWork[] = await Promise.all(d.sections.works.map(async (w) => {
    let src: Buffer | null = null;
    try { const r = await fetch(urls[w.images[0]]); if (r.ok) src = await fit(await r.arrayBuffer(), perImage); } catch { /* image left out, caption stays */ }
    return { title: w.title, year: w.year, technique: w.technique, dimensions: w.dimensions, src };
  }));
  // 3 text pages + works; pack two per page when a page limit would be exceeded
  const worksPerPage = d.limits.pages_max && 3 + works.length > d.limits.pages_max ? 2 : 1;

  const pdf = await renderToBuffer(DossierDocument({
    name: studio.profile.name, city: studio.profile.base_city, contact: [studio.profile.email_public, studio.profile.website].filter(Boolean).join(" · "),
    program, letter: d.sections.letter, bio: d.sections.bio, statement: d.sections.statement, cv: d.sections.cv, works, template, worksPerPage,
  }));
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="dossier.pdf"; filename*=UTF-8''${encodeURIComponent(d.fileName)}`,
      "x-dossier-bytes": String(pdf.length),
      "x-dossier-limit-bytes": d.limits.mb_max ? String(d.limits.mb_max * 1024 * 1024) : "",
    },
  });
}
