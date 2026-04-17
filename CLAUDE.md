# Green Panorama - Development Guide

> **Start here for context**: [README.md](./README.md) is the project overview (products, prototype, architecture). [EMBED.md](./EMBED.md) is the developer integration guide for hosts embedding an event map on their own site. This file is the AI-session rule set — parallel work, git, env vars, key file pointers.

## Parallel Work Rules

This repo has two Claude sessions working simultaneously:

- **Session 1 (CLI terminal):** works on `main` branch — frontend, verification flow, Vercel deployment
- **Session 2 (VSCode):** works on `feature/research-agents` branch — KiloClaw agent setup, backend agent code

### Git Rules
- NEVER force push
- Always `git pull` before pushing
- Session 2: create branch `git checkout -b feature/research-agents` before making changes
- Merge to main via fast-forward or PR when ready
- Session 2 should only modify files in `backend/` directory

## Project Overview

Verifiable Industries — protocol for AI-discovered, on-chain-verified industry maps. Green Panorama (Argentina's green sector) is the prototype. EventsVerified is the monetizable product: per-conference maps rendered inside organizers' own sites via the embed widget. Full overview in [README.md](./README.md).

## Tech Stack
- **Frontend:** Next.js 16, React 19, Tailwind 4, react-force-graph-2d
- **Backend:** Python FastAPI, OpenRouter API (key in backend/.env)
- **Database:** Supabase (PostgreSQL)
- **Blockchain:** GenLayer Studionet — contract at `0x57C566b552e528d86b230de35dbd847476f829c4`
- **Deploy:** Vercel (frontend at green-panorama-ar.vercel.app)

## Key Files
- `frontend/lib/genlayer.ts` — GenLayer SDK client (studionet, auto-funded accounts)
- `frontend/lib/event-configs.ts` — `EVENT_CONFIGS` registry (add new event slugs here)
- `frontend/app/api/verify/` — Verification API routes
- `frontend/app/event/[slug]/page.tsx` — full event map
- `frontend/app/event/[slug]/embed/` — iframe-safe variant for the embed widget
- `frontend/app/embed.js/route.ts` + `frontend/app/embed/v1.js/route.ts` — embed loader route handlers (substitute `__EMBED_ORIGIN__` from `NEXT_PUBLIC_EMBED_ORIGIN` at request time)
- `frontend/public/embed/embed.js` — embed loader source; pinned snapshot in `public/embed/v1/embed.js` (never edit after release)
- `frontend/hooks/useEmbedBridge.ts` — child-side postMessage protocol (`gp:ready`, `gp:resize`, `gp:config`)
- `backend/agents/research_agent.py` — Spider research agent (OpenRouter)
- `backend/main.py` — FastAPI server
- `contracts/green_panorama_qa.py` — GenLayer intelligent contract

## Docs
- `README.md` — project overview + sub-products + architecture
- `EMBED.md` — developer integration guide for hosts embedding event maps
- `PITCH.md` — demo flow, full pitch, data model
- `STRATEGY.md` — business, partnerships, monetization, action items
- `MILESTONES.md` — chronological build log

## Environment Variables
- `backend/.env`: OPENROUTER_API_KEY, SUPABASE_URL, SUPABASE_KEY
- `frontend/.env.local`: NEXT_PUBLIC_GENLAYER_CONTRACT, NEXT_PUBLIC_GENLAYER_EXPLORER, NEXT_PUBLIC_EMBED_ORIGIN (production origin that `/embed.js` should point iframes at, e.g. `https://verifiableindustries.com`)
