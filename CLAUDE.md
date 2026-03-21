# Green Panorama - Development Guide

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

Interactive node map of Argentina's green/carbon market ecosystem with AI research agents and GenLayer on-chain verification.

## Tech Stack
- **Frontend:** Next.js 16, React 19, Tailwind 4, react-force-graph-2d
- **Backend:** Python FastAPI, OpenRouter API (key in backend/.env)
- **Database:** Supabase (PostgreSQL)
- **Blockchain:** GenLayer Studionet — contract at `0x57C566b552e528d86b230de35dbd847476f829c4`
- **Deploy:** Vercel (frontend at green-panorama-ar.vercel.app)

## Key Files
- `frontend/lib/genlayer.ts` — GenLayer SDK client (studionet, auto-funded accounts)
- `frontend/app/api/verify/` — Verification API routes
- `backend/agents/research_agent.py` — Spider research agent (OpenRouter)
- `backend/main.py` — FastAPI server
- `contracts/green_panorama_qa.py` — GenLayer intelligent contract
- `PITCH.md` — Demo flow and pitch documentation

## Environment Variables
- `backend/.env`: OPENROUTER_API_KEY, SUPABASE_URL, SUPABASE_KEY
- `frontend/.env.local`: NEXT_PUBLIC_GENLAYER_CONTRACT, NEXT_PUBLIC_GENLAYER_EXPLORER
