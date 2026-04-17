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

### Frontend
- `frontend/lib/genlayer.ts` — GenLayer SDK client (studionet, 4-step verification chain)
- `frontend/lib/event-configs.ts` — `EVENT_CONFIGS` registry (add new event slugs here)
- `frontend/app/api/verify/` — Verification API routes (existence + description + sector + recency)
- `frontend/app/api/event/[slug]/opportunities/route.ts` — 5-phase opportunity matching pipeline
- `frontend/components/event/OpportunityPanel.tsx` — Opportunity panel with BD contact cards + one-click send
- `frontend/app/event/[slug]/page.tsx` — full event map

### Backend agents (Python, Docker on VPS)
- `backend/agents/research_daemon.py` — 24/7 research + verification cycles (10 min)
- `backend/agents/event_daemon.py` — Event intelligence + verification + connection discovery (15 min)
- `backend/agents/health_monitor.py` — Health checks + Telegram alerts + auto-unstick (30 min)
- `backend/agents/bd_contact_finder.py` — BD people search (Serper → Perplexity → DDG dorks)
- `backend/agents/outbound_writer.py` — 3-variant outbound message generator (X DM, LinkedIn, email)
- `backend/agents/research_agent.py` — Spider + company classifier (+ `research_company_for_event()`)
- `backend/agents/funding_researcher.py` — Perplexity deep discovery (parameterized for any industry/region)
- `backend/main.py` — FastAPI server with `/api/outbound/bd-contacts` endpoint

### Contracts
- `contracts/verifiable_industries.py` — GenLayer v7 contract (7 verification methods, custom validators)
- `contracts/green_panorama_qa.py` — Legacy hackathon contract (Argentina-specific)

### Docker
- `backend/deploy/docker/docker-compose.yml` — 4 services: research, event, health-monitor, outbound-api

## Docs
- `README.md` — project overview + sub-products + architecture
- `EMBED.md` — developer integration guide for hosts embedding event maps
- `PITCH.md` — demo flow, full pitch, data model
- `STRATEGY.md` — business, partnerships, monetization, action items
- `MILESTONES.md` — chronological build log

## Environment Variables
- `backend/.env`: OPENROUTER_API_KEY, SUPABASE_URL, SUPABASE_KEY, SERPER_API_KEY (Google search for BD contacts)
- `frontend/.env.local`: NEXT_PUBLIC_GENLAYER_CONTRACT, NEXT_PUBLIC_GENLAYER_EXPLORER, OUTBOUND_BACKEND_URL (VPS FastAPI, e.g. `http://72.61.216.166:8000`)

## VPS (Hostinger)
- IP: `72.61.216.166`, SSH key at `/Users/Macbook/Openclaw Master/hostingerVpsSsh`
- 4 Docker containers: research-agent, event-daemon, health-monitor, outbound-api
- OpenClaw gateway running (Telegram bot for health alerts)
- Deploy: `scp` files to `/root/green-panorama/backend/` then `docker compose up -d --build <service>`
