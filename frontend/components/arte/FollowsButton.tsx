"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Reads who the artist follows on Instagram (about a minute) so Descubrir and Invitar can use it. */
export function FollowsButton({ again = false }: { again?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "reading" | string>("idle");
  const read = async () => {
    setState("reading");
    const r = await fetch("/api/arte/import/follows", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ again }) }).then((x) => x.json()).catch(() => ({ error: "No pudimos leerlo ahora." }));
    if (r.error) { setState(r.error); return; }
    setState(`Leímos ${r.total} cuentas: ${r.inMap ?? 0} están en el mapa.${r.complete === false ? " Instagram cortó antes del final: podés volver a leer en unos minutos." : ""}`);
    router.refresh();
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className="btn btn-ghost !py-1.5 text-sm" disabled={state === "reading"} onClick={read}>{state === "reading" ? "Leyendo… (tarda un minuto)" : again ? "Volver a leer a quién sigo" : "Leer a quién sigo en Instagram"}</button>
      {state !== "idle" && state !== "reading" && <span className="text-sm muted" role="status">{state}</span>}
    </span>
  );
}
