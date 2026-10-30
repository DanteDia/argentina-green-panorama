import Link from "next/link";

const PILARES = [
  { t: "Convocatorias que te convienen", d: "Becas, residencias, premios y open calls de Argentina y del mundo, con fechas verificadas y por qué cada una te sirve (o no)." },
  { t: "Dossiers listos en minutos", d: "Cargás tu obra, tu bio y tu CV una sola vez. Para cada convocatoria armamos la carta, elegimos las obras y te damos el PDF." },
  { t: "Nada se te pasa", d: "Plan de temporada, checklist por postulación y alertas de cierre. Vos hacés obra; el papeleo lo llevamos nosotros." },
  { t: "Tu lugar en la escena", d: "Galerías, curadores y artistas afines a tu obra, sobre un mapa vivo de 300 galerías, 300 museos y 3.000 artistas." },
];

export default function ArteLanding() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-14 md:py-24">
      <div className="flex items-center justify-between">
        <Link href="/" className="eyebrow">IndustriesVerified</Link>
        <Link href="/arte/login" className="btn btn-ghost">Entrar</Link>
      </div>

      <section className="mt-16 md:mt-24 max-w-3xl">
        <p className="eyebrow">Cluster · Arte</p>
        <h1 className="display mt-4 text-5xl md:text-7xl leading-[1.02]">
          Hacé obra.<br />Del resto nos ocupamos.
        </h1>
        <p className="mt-6 text-lg md:text-xl text-[var(--ink-2)] max-w-2xl">
          Una herramienta para artistas que están creciendo: entiende tu trayectoria, te dice a qué postularte y te arma cada postulación.
        </p>
        <div className="mt-8 flex gap-3">
          <Link href="/arte/login" className="btn btn-primary">Crear mi perfil</Link>
          <a href="#como" className="btn btn-ghost">Cómo funciona</a>
        </div>
      </section>

      <section id="como" className="mt-20 grid gap-4 md:grid-cols-2">
        {PILARES.map((p) => (
          <div key={p.t} className="card p-6">
            <h2 className="display text-2xl">{p.t}</h2>
            <p className="mt-2 text-[var(--ink-2)]">{p.d}</p>
          </div>
        ))}
      </section>

      <p className="mt-16 text-sm muted">
        Datos de la escena: Mapa Cultural (SINCA), Cancillería · Directorio Argentina Creativa, Meridiano, arteBA, Wikidata, prensa y redes públicas. Cada fecha con su fuente.
      </p>
    </main>
  );
}
