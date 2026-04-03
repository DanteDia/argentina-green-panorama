# Industries Verified — Project Milestones & Evolution

## Timeline: March 21 → April 3, 2026 (13 days)

---

## Milestone 1: Aleph Hackathon — Green Panorama Prototype
**Date:** March 21-22, 2026 (48h hackathon)
**Result:** Won GenLayer Track Special Mention — 3rd place out of 700 participants

### What was built (Day 1-2):
- **Green Panorama** — interactive node map of Argentina's green/carbon market ecosystem
- 79 seed nodes manually researched + 47 edges
- Force-directed graph visualization (react-force-graph-2d)
- First GenLayer smart contract (`green_panorama_qa.py`) — basic node verification
  - Used `prompt_non_comparative` (validators don't re-fetch evidence, just judge leader)
  - Verified: exists, argentina_related, green_sector, description_accurate
- AI chat interface to query the ecosystem
- Research agent (spider pattern) discovering new companies
- Dark mode, cluster filtering, search, bilingual ES/EN
- Deployed on Vercel + Supabase

### GenLayer contract at hackathon:
- Single contract: `GreenPanoramaQA` — Argentina-specific, hardcoded for green sector
- 3 methods: verify_node, verify_relationship, verify_social
- Contract: `0x57C566b552e528d86b230de35dbd847476f829c4`

### Tech stack:
- Next.js 16, React 19, Tailwind 4, react-force-graph-2d
- FastAPI backend, Supabase PostgreSQL
- GenLayer Studionet, genlayer-js SDK
- OpenRouter API (Gemini Flash)

---

## Milestone 2: Post-Hackathon — Autonomous Research System
**Date:** March 22-25, 2026

### Improvements:
- **24/7 research daemon** running on Hostinger VPS via Docker
- **Perplexity Sonar integration** for deep funding research ($0.006/query)
- **Adaptive discovery modes**: normal → boost (when rate slows) → saturation
- **Anti-spiral guardrails**: MAX_DEPTH=2, MAX_AGENT_NODES=500
- **Automated verification cron** on Vercel — verifies 2 nodes + 1 edge per 10 min cycle
- **Verification feedback loop**: failed → re-research → retry → grey mode after 3 failures
- **Anti-sycophancy**: trust GenLayer consensus for sector/region rejection instead of re-asking LLM

### Results:
- Database grew from 79 → 460+ nodes autonomously
- 660+ connections mapped
- 26 on-chain verifications

---

## Milestone 3: Generic Contract — From Green to Any Industry
**Date:** March 25-27, 2026

### The pivot:
- Renamed concept from "Green Panorama" to **"Verifiable Industries"**
- Rewrote contract as `VerifiableIndustries` — works for ANY industry, ANY country
- Added `map_id` parameter to namespace different industry maps
- Added `country` and `sector` as parameters (not hardcoded to Argentina/green)

### Contract evolution:
- v1: `GreenPanoramaQA` — Argentina-only, green-only
- v2: `VerifiableIndustries` — generic with map_id, sector, country parameters
- v3: Added hybrid web + LLM verification, funding source verification

### Website redesign:
- Institutional cream/beige palette inspired by Anthropic
- Interactive COBE globe showing Argentina
- "Industries, Verified." headline
- How It Works section, live stats, footer
- Bilingual landing page (ES/EN)

---

## Milestone 4: Smart Contract Deep Iteration with GenLayer Team
**Date:** March 28 - April 2, 2026

### Ivan Raskovsky (GenLayer co-founder) feedback:
- "Does it necessarily need to be trustless?" → Pivoted to anti-hallucination positioning
- GenLayer = insurance policy against AI agent hallucinations

### Contract evolution (7 versions):
- **v4**: Switched to `prompt_comparative` — all validators independently fetch + reason
- **v5**: 1 TX = 1 claim architecture (no batching)
- **v6**: Applied GenLayer Skills best practices — `web.render()`, `response_format="json"`
- **v7**: `run_nondet_unsafe` with custom validator functions (GenLayer's recommended pattern)
  - Defensive boolean coercion
  - Error classification: EXPECTED, EXTERNAL, TRANSIENT, LLM_ERROR
  - Social media evidence for funding + relationship verification
  - 7 independent methods: existence, description, sector, recency, social, funding, relationship

### Key technical learnings:
- `prompt_non_comparative` = validators only judge leader's output (can rubber-stamp hallucinations)
- `prompt_comparative` = validators re-run everything independently (real cross-checking)
- `run_nondet_unsafe` = custom validator logic, most flexible, GenLayer recommended
- `web.render()` renders JavaScript (captures dynamic sponsor logos that `web.get()` misses)
- `response_format="json"` = GenLayer's #1 best practice for exec_prompt

---

## Milestone 5: EventsVerified — First Monetization Path
**Date:** April 1-3, 2026

### Discovery:
- The public good (industry mapping) is valuable, but events are the monetization lever
- Each conference = a new map with immediate commercial value for attendees

### What was built:
- **Multi-map architecture**: `maps` table, `event_participants` table, `node_intelligence` table, `synergies` table
- **BlockchainRio 2026 event page**: 65 companies, dark mode, blockchain cluster colors
- **Event research daemon**: 24/7 deep research per company (grants, partnerships, hiring, funding)
- **Opportunity matching system** — user inputs their company URL, gets ranked matches:
  - 3-phase deep research: core identity, clients/partners, geography
  - Website content grounding (prevents Perplexity from confusing companies)
  - node_intelligence enrichment (recent signals drive matches)
  - Existing relationship detection (user's company already works with a participant)
  - Conference-specific action items
- **Context-aware AI chat**: knows which map you're viewing, serves relevant data
- **Visual distinction**: participants vs connected nodes, sponsor tier glow rings

### Results:
- Transcendence Platform test: correctly identifies Bitget as existing client (score 1.0), matches Chiliz for hologram experiences
- GenLayer test: matches Polygon, Base, Starknet as technology complements with intel signals

---

## By the Numbers

| Metric | Hackathon Day (Mar 22) | Today (Apr 3) |
|--------|----------------------|---------------|
| Nodes | 79 (manual) | 630+ (autonomous) |
| Edges | 47 | 970+ |
| GenLayer contract versions | 1 | 7 |
| Contract methods | 3 | 7 |
| Consensus mechanism | prompt_non_comparative | run_nondet_unsafe (custom validators) |
| Research agents | 1 (spider) | 3 (general + funding + event) |
| Event maps | 0 | 1 (BlockchainRio) |
| Total commits | 42 | 78 |
| Lines of code | ~4,000 | 13,337 |
| Features | Graph + search | Graph + chat + opportunities + events + verification |

---

## GenLayer Contract Addresses (chronological)

1. `0x57C566b552e528d86b230de35dbd847476f829c4` — v1 GreenPanoramaQA (hackathon)
2. `0xb81f386D893cda2016bfAeC6FF9B2027CD35413d` — v2 VerifiableIndustries (generic)
3. `0xBBC62F047b30a424031dB0FB0e86c414f8c822E0` — v3 with funding verification
4. `0xd410384E9039F0AC48996eF0da29dE602dee1aCc` — v3.1 hybrid web+LLM
5. `0xe8760c16A5eB8368612d421d1185B76b501F6e11` — v5 (1 TX = 1 claim, prompt_comparative)
6. Latest v7 — pending deployment (run_nondet_unsafe + social evidence)
