"use client";
import { useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/arte/supabase-browser";
import { addWorks } from "@/app/arte/(app)/perfil/actions";
import { workFromFilename } from "@/lib/arte/works";

const MAX_FILES = 30, MAX_MB = 25;

/** Pick many images at once: each becomes a work (title from the file name when it has one) and the sheets are filled later. */
export function BulkWorks({ userId }: { userId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload(list: FileList | null) {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/") && f.size <= MAX_MB * 1024 * 1024).slice(0, MAX_FILES);
    const skipped = (list?.length ?? 0) - files.length;
    if (!files.length) { setStatus(list?.length ? `Ninguna servía: tienen que ser imágenes de hasta ${MAX_MB} MB.` : ""); return; }
    setBusy(true);
    const supabase = createBrowserSupabase();
    const done: { path: string; title: string; year: string | null }[] = [];
    for (const [i, f] of files.entries()) {
      setStatus(`Subiendo ${i + 1} de ${files.length}…`);
      const path = `${userId}/works/${crypto.randomUUID()}.${(f.name.split(".").pop() || "jpg").toLowerCase()}`;
      const { error } = await supabase.storage.from("arte-private").upload(path, f, { contentType: f.type, upsert: false });
      if (!error) done.push({ path, ...workFromFilename(f.name) });
    }
    try {
      const n = done.length ? await addWorks(done) : 0;
      const failed = files.length - n;
      setStatus(`Listo: ${n} ${n === 1 ? "obra nueva" : "obras nuevas"}.${failed ? ` ${failed === 1 ? "1 no se pudo" : `${failed} no se pudieron`} subir.` : ""}${skipped ? ` ${skipped === 1 ? "1 quedó" : `${skipped} quedaron`} afuera (solo imágenes de hasta ${MAX_MB} MB, ${MAX_FILES} por vez).` : ""} Tocá cada una para completar su ficha.`);
    } catch { setStatus("Las imágenes subieron pero no pudimos crear las obras. Probá de nuevo."); }
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Subiendo…" : "Subir varias a la vez"}</button>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} aria-label="Elegir imágenes de obras" />
      {status && <span className="text-sm muted" role="status">{status}</span>}
    </span>
  );
}
