// Public: where the scene map's data comes from, and how to ask for a correction or a removal (Ley 25.326).
import type { Metadata } from "next";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { decodeEntities, PUBLIC_CATEGORIES, UUID } from "@/lib/arte/escena";
import { requestCorrection } from "../escena/actions";

export const metadata: Metadata = {
  title: "Tus datos en la escena · Arte",
  description: "De dónde salen los datos del mapa de la escena y cómo pedir que los corrijamos o los saquemos.",
};

export default async function Datos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ficha = sp.ficha && UUID.test(sp.ficha) ? sp.ficha : null;
  const { data: node } = ficha && supabase ? await supabase.from("nodes").select("nombre").eq("id", ficha).overlaps("industries", ["arte"]).in("categoria", PUBLIC_CATEGORIES).maybeSingle() : { data: null };

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 md:py-16">
      <Link href={ficha ? `/arte/escena/${ficha}` : "/arte/escena"} className="eyebrow">← {node ? decodeEntities(node.nombre) : "La escena"}</Link>
      <h1 className="display mt-8 text-4xl md:text-5xl">Tus datos en la escena</h1>

      <div className="mt-6 space-y-4 text-[var(--ink-2)]">
        <p>
          El mapa de la escena reúne galerías, museos, espacios, artistas y curadores del arte argentino para que los artistas sepan dónde
          mostrar y a quién escribir. Lo armamos con información que ya es pública: los sitios de cada espacio, sus perfiles de Instagram,
          prensa especializada y las bases de convocatorias y premios.
        </p>
        <p>
          En cada ficha mostramos el nombre, una descripción, con quién trabaja y los datos de contacto que el espacio o la persona publica.
          Nunca mostramos coleccionistas ni quién compró o donó obra de quién.
        </p>
        <p>
          Si una ficha es tuya o habla de vos, podés pedir que corrijamos algo, que saquemos tus datos de contacto o que borremos la ficha
          entera. Es tu derecho según la Ley 25.326 de Protección de Datos Personales, y lo resolvemos dentro de los 5 días hábiles.
        </p>
      </div>

      <section id="pedido" className="card mt-8 p-5">
        <h2 className="display text-xl">Pedir una corrección o una baja</h2>
        {sp.gracias ? (
          <p className="mt-3 font-medium">Recibimos tu pedido. Te escribimos al mail que dejaste cuando esté hecho.</p>
        ) : (
          <form action={requestCorrection} className="mt-4 space-y-2">
            {ficha && <input type="hidden" name="node_id" value={ficha} />}
            <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
            {node && <p className="text-sm muted">Sobre la ficha de {decodeEntities(node.nombre)}</p>}
            <input name="name" required placeholder="Tu nombre" className="input" aria-label="Tu nombre" />
            <input name="email" type="email" required placeholder="Tu mail" className="input" aria-label="Tu mail" />
            <select name="kind" className="input" aria-label="Qué querés pedir" defaultValue="Corregir datos">
              <option>Corregir datos</option><option>Sacar mis datos de contacto</option><option>Borrar la ficha</option>
            </select>
            <textarea name="message" rows={4} required placeholder={node ? "Contanos qué hay que cambiar." : "Contanos qué ficha es y qué hay que cambiar."}
              className="input" aria-label="Qué hay que cambiar" />
            {sp.falta && <p className="text-sm">Falta tu nombre, un mail válido o el pedido.</p>}
            {sp.error && <p className="text-sm">No pudimos guardarlo, probá de nuevo.</p>}
            <button className="btn btn-primary">Enviar pedido</button>
          </form>
        )}
      </section>

      <p className="mt-8 text-sm muted">
        La Agencia de Acceso a la Información Pública, órgano de control de la Ley 25.326, atiende las denuncias y reclamos de quienes
        consideren que no se respetan sus derechos sobre sus datos personales.
      </p>
    </main>
  );
}
