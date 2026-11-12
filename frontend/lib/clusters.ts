// The clusters of the one big map: every industry and every event the site covers. This registry is the single place a
// cluster is added; the landing (banner, "Industries and events" section, the counter) is rendered from it. Each cluster
// keeps its own experience behind `href`, because the people it serves differ: an artist does not use the map the way
// a conference attendee does.
//   - a new industry: add an entry to INDUSTRIES below.
//   - a new event: add it to EVENT_CONFIGS in ./event-configs.ts (its map is served at /event/<slug>); it appears here by itself.
import { EVENT_CONFIGS } from "./event-configs";

type Copy = { es: string; en: string };

export interface Cluster {
  slug: string;
  kind: "industry" | "event";
  name: string;
  href: string;      // where this cluster's own experience starts
  blurb: Copy;       // what is mapped
  audience: Copy;    // who it is built for
  cta: Copy;
  stat?: Copy;       // a short figure shown on its card
  since: string;     // YYYY-MM-DD it joined the map; the newest one is announced in the banner
}

const INDUSTRIES: Cluster[] = [
  {
    slug: "green-panorama",
    kind: "industry",
    name: "Green Panorama",
    href: "#prototype",
    blurb: {
      es: "El sector verde, de carbono y sustentabilidad de Argentina: empresas, fondos, ONG y organismos públicos, y cómo se conectan.",
      en: "Argentina's green, carbon and sustainability sector: companies, funds, NGOs and public bodies, and how they connect.",
    },
    audience: { es: "Para quienes trabajan o invierten en el sector", en: "For people working or investing in the sector" },
    cta: { es: "Explorar el mapa", en: "Explore the map" },
    since: "2026-03-21",
  },
  {
    slug: "arte",
    kind: "industry",
    name: "Arte",
    href: "/arte",
    blurb: {
      es: "La escena del arte argentino: galerías, museos, artistas y curadores, y las convocatorias, premios y residencias a las que un artista puede postular.",
      en: "The Argentine art scene: galleries, museums, artists and curators, and the open calls, prizes and residencies an artist can apply to.",
    },
    audience: { es: "Para artistas: postulaciones, dossier e invitados", en: "For artists: applications, dossier and guest lists" },
    cta: { es: "Abrir Arte", en: "Open Arte" },
    stat: { es: "6.000+ actores", en: "6,000+ actors" },
    since: "2026-10-30",
  },
];

const EVENTS: Cluster[] = Object.entries(EVENT_CONFIGS).map(([slug, e]) => ({
  slug,
  kind: "event",
  name: e.name,
  href: `/event/${slug}`,
  blurb: {
    es: `${e.dates} · ${e.location}. Las empresas que participan y quién trabaja con quién.`,
    en: `${e.dates} · ${e.location}. The companies attending and who works with whom.`,
  },
  audience: { es: "Para asistentes y organizadores", en: "For attendees and organisers" },
  cta: { es: "Ver mapa", en: "View map" },
  stat: slug === "blockchainrio-2026" ? { es: "65+ actores", en: "65+ actors" } : undefined,
  since: "2026-04-17",   // the day the events registry was added; an event has no date of its own there
}));

export const CLUSTERS: Cluster[] = [...INDUSTRIES, ...EVENTS];

export const newestCluster = (): Cluster | undefined => [...CLUSTERS].sort((a, b) => b.since.localeCompare(a.since))[0];
