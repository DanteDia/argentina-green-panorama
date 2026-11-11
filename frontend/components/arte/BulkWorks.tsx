"use client";
import { useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/arte/supabase-browser";
import { addWorks } from "@/app/arte/(app)/perfil/actions";
import { MAX_BULK, workFromFilename } from "@/lib/arte/works";

const MAX_MB = 25;
type Item = { path: string; title: string; year: string | null };

/** Pick many images at once: each becomes a work (title from the file name when it has one) and the sheets are filled later. */
export function BulkWorks({ userId, onDone }: { userId: string; onDone?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [unsaved, setUnsaved] = useState<Item[] | null>(null);   // uploaded but not yet turned into works: retried without uploading again

  async function save(items: Item[], extra = "") {
    try {
      const n = await addWorks(items);
      setUnsaved(null);
      setStatus(`Listo: ${n} ${n === 1 ? "obra nueva" : "obras nuevas"}.${extra} Tocá cada una para completar su ficha.`);
      onDone?.();
    } catch {
      setUnsaved(items);
      setStatus("Las imágenes ya subieron, pero no pudimos crear las obras.");
    }
  }

  async function upload(list: FileList | null) {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/") && f.size <= MAX_MB * 1024 * 1024).slice(0, MAX_BULK);
    const skipped = (list?.length ?? 0) - files.length;
    const left = skipped ? ` ${skipped === 1 ? "1 quedó" : `${skipped} quedaron`} afuera (solo imágenes de hasta ${MAX_MB} MB, ${MAX_BULK} por vez).` : "";
    if (!files.length) { setStatus(list?.length ? `Ninguna servía: tienen que ser imágenes de hasta ${MAX_MB} MB.` : ""); return; }
    setBusy(true);
    try {
      const supabase = createBrowserSupabase();
      const done: Item[] = [];
      for (const [i, f] of files.entries()) {
        setStatus(`Subiendo ${i + 1} de ${files.length}…`);
        const path = `${userId}/works/${crypto.randomUUID()}.${(f.name.split(".").pop() || "jpg").toLowerCase()}`;
        const { error } = await supabase.storage.from("arte-private").upload(path, f, { contentType: f.type, upsert: false });
        if (!error) done.push({ path, ...workFromFilename(f.name) });
      }
      const failed = files.length - done.length;
      const lost = failed ? ` ${failed === 1 ? "1 no se pudo" : `${failed} no se pudieron`} subir.` : "";
      if (!done.length) setStatus(`No se pudo subir ninguna imagen. Probá de nuevo.${left}`);
      else await save(done, lost + left);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Subiendo…" : "Subir varias a la vez"}</button>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} aria-label="Elegir imágenes de obras" />
      {status && <span className="text-sm muted" role="status">{status}</span>}
      {unsaved && !busy && <button type="button" className="text-sm underline" onClick={async () => { setBusy(true); try { await save(unsaved); } finally { setBusy(false); } }}>Reintentar</button>}
    </span>
  );
}
