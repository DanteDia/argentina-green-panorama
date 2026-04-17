# Verifiable Industries

**A protocol for mapping and verifying any industry using AI research agents and GenLayer intelligent contracts.**

Every industry has a living ecosystem — companies, funds, NGOs, government agencies, their relationships, their money flows. Most of that ecosystem is invisible. Verifiable Industries builds interactive, blockchain-verified maps of those ecosystems. AI agents discover the actors 24/7 by reading the open web. GenLayer validators independently reach consensus that each actor is real, active, and described accurately.

- **Live landing**: [industriesverified.com](https://industriesverified.com)
- **Flagship map**: [green-panorama-ar.vercel.app](https://green-panorama-ar.vercel.app)
- **See also**: [PITCH.md](./PITCH.md) · [STRATEGY.md](./STRATEGY.md) · [MILESTONES.md](./MILESTONES.md)

---

## Product line

The protocol is one thing. What we sell sits on top of it. Today there are three surfaces:

### 1. Green Panorama — the prototype
The first industry map we built. Argentina's green/carbon sector: 630+ organizations, 970+ relationships, verified on-chain. It exists to prove the protocol works — autonomous research, on-chain consensus, natural-language exploration — and to generate the public story that opens doors with partners and funders.

Stack: Next.js frontend, research daemon on Docker/VPS, Supabase for storage, GenLayer for consensus. Code is in `frontend/` and `backend/`; the contract is in `contracts/`.

### 2. EventsVerified — the monetizable product
Same protocol, rebuilt around a single conference. For each event we ingest the attendee/sponsor list, run deep research per company (funding signals, hiring, recent partnerships), and give attendees a graph + an opportunity matcher: paste your company URL, get ranked matches among other attendees (clients, partners, complementary tech).

First live event map: **BlockchainRio 2026** at `/event/blockchainrio-2026`.

Revenue model: $2–10K per event (freemium on the basic map, paid deep insights, sponsor placements). Pricing and target events in [STRATEGY.md §4](./STRATEGY.md).

**The embed system** (see [EMBED.md](./EMBED.md)) is what makes this distributable: organizers drop two lines of HTML into their own site — Webflow, WordPress, plain HTML, anything — and the event experience renders natively inside their page. Cross-origin safe, CSS-isolated, versioned.

### 3. GenLayer intelligent contracts — the trust layer
Reusable verification infrastructure that any industry map plugs into. `VerifiableIndustries` is the generic contract; `GreenPanoramaQA` is a sector-specific instance. Validators fetch websites, run LLM reasoning, and reach consensus on whether each claim is accurate. This is what turns "AI said so" into "seven independent validators verified it on-chain". Contract source in `contracts/`.

---

## Architecture at a glance

```
                         Users (Browser)
                              |
          ┌───────────────────┴───────────────────┐
          |                                       |
   Marketing / Maps                     Embedded on partner site
   (industriesverified.com,             (Blockchain Rio, future events)
    green-panorama-ar.vercel.app)              via /embed.js
                              |
                 Next.js 16 Frontend (Vercel)
                 ├── /              marketing landing
                 ├── /event/[slug]           full event map
                 ├── /event/[slug]/embed     iframe-safe variant
                 ├── /embed.js               loader script (latest)
                 ├── /embed/v1.js            pinned loader (stable)
                 └── /api/*                  REST endpoints
                              |
         ┌────────────────────┼────────────────────┐
         |                    |                    |
     Supabase          Research daemons       GenLayer Studionet
     (PostgreSQL)      (Python, Docker,       (intelligent contracts,
                       OpenRouter, Perplexity) on-chain consensus)
```

---

## Embedding an event map on your site

Two lines — nothing else required. Works on Webflow, WordPress, plain HTML, any CMS that lets you paste a snippet.

```html
<div data-green-panorama-event="blockchainrio-2026" data-height="720"></div>
<script src="https://verifiableindustries.com/embed/v1.js" async></script>
```

That renders the full event experience — interactive graph, AI chat, opportunity matcher — inside an iframe we serve. Styling, theme, locale, height, auto-resize, and a JavaScript API for analytics callbacks are all covered in **[EMBED.md](./EMBED.md)**.

---

## Repository layout

```
green-panorama/
├── README.md              you are here
├── EMBED.md               developer integration guide for the iframe widget
├── CLAUDE.md              dev rules for AI sessions (parallel work, git, env)
├── PITCH.md               deep product pitch / demo script
├── STRATEGY.md            business, partnerships, monetization, dates
├── MILESTONES.md          chronological build log
├── contracts/             GenLayer intelligent contracts (Python)
├── backend/               FastAPI + research daemons (Python, OpenRouter)
└── frontend/              Next.js 16 app (marketing + maps + embed system)
    ├── app/
    │   ├── page.tsx              marketing landing
    │   ├── event/[slug]/         full event page
    │   ├── event/[slug]/embed/   iframe-safe variant
    │   ├── embed.js/route.ts     loader (latest)
    │   ├── embed/v1.js/route.ts  loader (pinned)
    │   └── api/                  REST endpoints
    ├── components/event/   EventMapShell + panels
    ├── hooks/              useEmbedBridge (postMessage wiring), useIsMobile
    ├── lib/                event-configs, genlayer client, supabase, types
    └── public/embed/       loader source (embed.js + v1/ snapshot)
```

---

## Local development

```bash
# frontend
cd frontend
npm install
npm run dev          # http://localhost:3000

# backend (research daemons + API)
cd ../backend
# see backend/README for setup
```

Environment variables:
- `frontend/.env.local`: `NEXT_PUBLIC_GENLAYER_CONTRACT`, `NEXT_PUBLIC_GENLAYER_EXPLORER`, `NEXT_PUBLIC_EMBED_ORIGIN` (production origin the loader should point iframes at — e.g., `https://verifiableindustries.com`)
- `backend/.env`: `OPENROUTER_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`

Testing the embed locally is documented in [EMBED.md § Local testing](./EMBED.md#local-testing).

---

## Tech stack

| Layer       | Technology                                                              |
|-------------|-------------------------------------------------------------------------|
| Frontend    | Next.js 16, React 19, Tailwind 4, react-force-graph-2d                  |
| Backend     | Python FastAPI, OpenRouter, Perplexity Sonar                            |
| Database    | Supabase (PostgreSQL)                                                   |
| Blockchain  | GenLayer Studionet (intelligent contracts), genlayer-js SDK             |
| Deploy      | Vercel (frontend), Hostinger VPS + Docker (research daemons)            |

---

## Status

Post-hackathon, pre-seed. Won GenLayer Track Honorable Mention at Aleph Hackathon, March 2026. Current focus: validate EventsVerified with the first paying organizer, publish the GenLayer co-authored blog post, open conversations with Lucero Ventures. See [STRATEGY.md](./STRATEGY.md) for action items and dates.
