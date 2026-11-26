// The weekly mail's unsubscribe page. It acts only on a button press: mail scanners open links, and a link that
// unsubscribed by itself would unsubscribe artists who never asked.
import Link from "next/link";
import { setDigest } from "./actions";

export default async function Baja({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ok = sp.u && sp.t && !sp.error;
  return (
    <main className="mx-auto max-w-md px-5 py-16">
      <Link href="/arte" className="eyebrow">← Arte</Link>
      <div className="card mt-6 p-6">
        <h1 className="display text-2xl">El mail de los lunes</h1>
        {!ok ? (
          <p className="mt-3 muted">Este link no es válido. Abrí el último mail que te llegó y usá el link de abajo de todo.</p>
        ) : sp.listo === "baja" ? (
          <>
            <p className="mt-3">Listo, no te lo mandamos más. Las oportunidades siguen en tu cuenta.</p>
            <form action={setDigest} className="mt-4"><input type="hidden" name="u" value={sp.u} /><input type="hidden" name="t" value={sp.t} /><button className="btn btn-ghost">Volver a recibirlo</button></form>
          </>
        ) : (
          <>
            <p className="mt-3">{sp.listo === "alta" ? "Listo, te lo volvemos a mandar cada lunes." : "Cada lunes te mandamos las convocatorias nuevas para tu perfil y las que cierran pronto."}</p>
            {sp.listo !== "alta" && (
              <form action={setDigest} className="mt-4"><input type="hidden" name="u" value={sp.u} /><input type="hidden" name="t" value={sp.t} /><input type="hidden" name="off" value="1" /><button className="btn btn-primary">No recibir más este mail</button></form>
            )}
          </>
        )}
      </div>
    </main>
  );
}
