# Verifiable Industries - Pitch Documentation

## One-Liner
A protocol for mapping and verifying ANY industry using AI agents and GenLayer intelligent contracts. Green Panorama (Argentina's green sector) is the first live implementation.

## The Big Idea
What if every industry had a living, verified map? Every company, every fund, every relationship — discovered by AI agents and verified on-chain by multi-validator consensus. Not just green tech. Aviation. Fintech. Healthcare. Any sector, any country.

**Verifiable Industries** is the infrastructure layer. **Green Panorama** is the proof it works.

## The Problem
Argentina has massive potential in carbon markets, conservation, and cleantech — but:
1. **Nobody knows the ecosystem exists** — companies, NGOs, funds, and government agencies working in the green sector are invisible to each other
2. **Getting in is hard** — understanding money flows, relationships, and who does what requires months of manual research
3. **Trust is missing** — no way to verify if a company is real, active, and actually operating in the green sector

## The Solution: Green Panorama

An interactive node graph that maps Argentina's entire green/carbon market ecosystem, powered by AI research agents that work 24/7 and verified on-chain by GenLayer intelligent contracts.

---

## Technical Architecture

```
                          Users (Browser)
                               |
                     Next.js Frontend (Vercel)
                    /          |           \
          react-force-graph  API Routes   GenLayerJS SDK
           (Interactive Map)    |              |
                               |         GenLayer Studio
                          Supabase          (Studionet)
                         (PostgreSQL)          |
                          /       \       GreenPanoramaQA
                         /         \      Intelligent Contract
            Research Daemon      AI Chat   - verify_node()
          (Docker on VPS, 24/7)  (Gemini)  - verify_social()
             /       |       \             - verify_relationship()
     Website    Perplexity    Gemini
     Scraping   Sonar/Pro    Flash Lite
    (HTML parse) (newsletters, (classification,
                 social media,  funding from HTML)
                 press releases)
```

---

## Hero Steps (Demo Flow)

### Step 1: Welcome & Onboarding
- Open green-panorama-ar.vercel.app
- First-time visitors see a welcome overlay explaining:
  - What Green Panorama is (interactive map of 380+ green organizations, growing autonomously)
  - How nodes and connections work
  - What blockchain verification means
- Two entry points: "Explorar el Mapa" or "Preguntar al Ecosistema"

### Step 2: The Graph
- 380+ nodes representing real companies/institutions in Argentina's green sector (growing 24/7)
- 540+ edges showing real relationships (funding, partnerships, clients)
- Color-coded by cluster: Funds (green), Startups (lime), NGOs (orange), Private (blue), Accelerators (purple), Government (red), International (cyan)
- Force-directed physics — nodes cluster naturally by relationships
- Edge type legend with toggle filters (Fondea, Aliados, Clientes, Portfolio, Regula)

### Step 3: AI Chat — "Pregunta al Ecosistema"
- Click the green chat bubble (bottom-right)
- Ask natural language questions in Spanish or English:
  - "Quienes son los principales fondos verdes?" → lists all green funds
  - "Que empresas fondea Antom?" → traces funding relationships
  - "Startups de bonos de carbono" → filters by sector
  - "Como se conecta Kilimo con organizaciones internacionales?" → path analysis
- Powered by Gemini 2.0 Flash via OpenRouter with full graph context
- Clickable node tags in responses — click to navigate to that node on the graph
- Node highlighting: mentioned companies glow on the graph for 10 seconds

### Step 4: Explore a Node
- Click any node (e.g., Antom, Ruuts, Kilimo)
- Detail panel shows: cluster, category, website, followers, description, funding sources, partners, clients
- See all connections — who funds them, who they partner with, who their clients are
- Navigate the graph by clicking connected nodes
- Search with autocomplete dropdown — type 2+ characters to see matching nodes

### Step 5: On-Chain Verification with GenLayer
- Click "Verificar en GenLayer" on any unverified node
- The GenLayer intelligent contract (3 verification methods):

#### verify_node() — Company Verification
5 AI validators independently verify using different LLMs:
1. **Exists**: Fetches website in real-time, checks if company is real
2. **Argentina related**: Headquartered, operates in, or has programs in Argentina
3. **Green sector**: Part of green/carbon/environmental/sustainability sector
4. **Description accurate**: Provided description matches reality
Result: per-field green/red/grey dots next to each data field in the detail panel

#### verify_relationship() — Connection Verification (NEW: 3-source)
Validators check THREE sources to find evidence (aligned with how research agents discover):
1. **Website A** — fetch company A's website for partner mentions
2. **Website B** — fetch company B's website for partner mentions
3. **Web search** — Google search for "{Company A} {Company B}" to find press releases, news articles, LinkedIn posts that company websites miss
Also verifies relationship TYPE (funds vs partners vs client vs portfolio vs regulates).
If type is wrong, suggests the correct type.

#### verify_social() — Social Media Audit
For each social link (Instagram, LinkedIn, Twitter, etc.):
1. Is the link valid?
2. Does the profile belong to this company?
3. Is it a real account (not fake)?
4. Do follower counts match claimed numbers?
5. Activity level: active, dormant, or dead?

#### Per-Field Verification Display
Each data field shows a tiny colored dot:
- **Green**: Verified on-chain by GenLayer consensus
- **Red**: Verification failed
- **Grey**: Not yet verified
Dots appear next to: website, description, category, funding, partners, each connection

#### Honest Verification Policy
| Field | Discovery Source | Verification Source | Status |
|-------|----------------|-------------------|--------|
| Company exists | Website + LLM | Website + LLM knowledge | Verified by GenLayer |
| Argentina related | LLM classification | Website + LLM knowledge | Verified by GenLayer |
| Green sector | LLM classification | Website + LLM knowledge | Verified by GenLayer |
| Description | LLM generation | Website + LLM knowledge | Verified by GenLayer |
| Relationship exists | Perplexity + website | Website + web search + LLM | Verified by GenLayer |
| Relationship type | LLM classification | Website + web search + LLM | Verified by GenLayer |
| Social presence | Link extraction | Direct profile fetch | Verified by GenLayer |
| Funding sources | Perplexity + website | Not individually verified | Shown as unverified (grey) |
| Client list | Website scraping | Not verified | Shown as unverified (grey) |

Fields without GenLayer verification honestly display grey dots — we never fabricate verification status.

### Step 6: Social Media Audit
- For nodes with social media links (Instagram, LinkedIn, Twitter)
- Click "Auditar Redes Sociales"
- Contract verifies: is the account real? Does it belong to this company? Are follower counts accurate? Is the account active or dead?
- Result: per-platform audit with follower match indicators

### Step 7: Batch Verification
- Click "Verificar Nodos" in the sidebar
- Automatically verifies 5 nodes at once
- Watch the graph light up with pulsing amber badges (pending) turning green (verified)

### Step 8: Autonomous Research Agent (24/7 Docker Daemon)
The research agent runs in a Docker container on a VPS, executing a multi-step cycle every 10 minutes:

**Every cycle (10 min):**

1. **Company Selection** — Picks the next company to research using weighted random selection (seed nodes 10x weight, depth-1 nodes 2x). Nodes at max depth (2) are excluded.

2. **Website Spidering** — Fetches the company's homepage + partner subpages (`/partners`, `/aliados`, `/portfolio`). Uses Gemini Flash Lite to extract partners, clients, and funders from HTML.

3. **Deep Internet Research (Perplexity Sonar)** — For seed nodes (depth-0), uses Perplexity Sonar Pro via OpenRouter to search newsletters, press releases, LinkedIn, social media, conference panels, and event reports for relationships that official websites miss. Falls back to LLM knowledge if Perplexity is unavailable.

4. **Company Classification** — Each discovered company is classified by an LLM: cluster (Startup, ONG, Fondo Verde, etc.), category, description, funding sources, and whether it genuinely interacts with Argentina's green sector. Strict gating: rejects generic companies, requires Argentina + green sector relevance.

5. **Deduplication** — Fuzzy name matching (0.75 threshold) with suffix/punctuation normalization catches duplicates like "Fundación Vida Silvestre" vs "Fundación Vida Silvestre Argentina".

6. **Atomic Insertion** — New nodes are inserted with their edge in a single atomic operation. If the edge fails, the node is rolled back — **zero orphan guarantee** (no node ever exists without at least one relationship).

7. **Funding Discovery** — For newly inserted nodes at depth 0-1, Perplexity Sonar researches specific funding sources (investors, grants, accelerators). Updates `quien_fondea` field and creates `funds` edges. Max 3 Perplexity calls per cycle.

8. **Auto-Verification** — New nodes are automatically submitted to GenLayer for on-chain verification via multi-validator AI consensus.

**Periodic passes (within the cycle loop):**

- **Every 2nd cycle**: Deep relationship discovery — picks already-visited nodes and searches for relationships announced outside official websites (newsletters, social media, press releases)
- **Every 3rd cycle**: Verification pass — re-verifies unverified/failed nodes
- **Every 5th cycle**: Orphan sweep — finds any nodes with 0 connections, attempts to connect them via Perplexity, deletes if no relationship found

**Anti-Spiral Guardrails:**
- Max depth: 2 (seed → direct partner → partner-of-partner → STOP)
- Global budget: 500 max agent-discovered nodes
- LLM-only discoveries rejected at depth 1+ (only website/Perplexity sources allowed)
- Weighted random prevents depth-first spiraling into irrelevant clusters

**Confidence Tiers:**
- Website-scraped relationships: 0.8 confidence
- Perplexity-discovered relationships: 0.7 confidence
- LLM knowledge-based relationships: 0.4 confidence

**Current Stats (live, growing):**
- 382+ nodes, 546+ edges, 0 orphans
- 119 nodes with funding data populated
- Research sources: official websites + Perplexity web search (newsletters, press releases, LinkedIn, social media)

---

## Technical Decisions & Why

### GenLayer (not a regular smart contract)
- **Why**: Traditional smart contracts can't fetch websites or use AI reasoning. GenLayer's intelligent contracts can do both via `gl.nondet.web.get()` and `gl.nondet.exec_prompt()`.
- **Consensus**: `prompt_non_comparative` — leader validator does the work, other validators judge if the result is reasonable. More reliable than requiring identical outputs from different LLMs.
- **Two contracts**:
  - `VerifiableIndustries` (generic) — verifies ANY entity in ANY sector/country. Reusable infrastructure.
  - `GreenPanoramaQA` (sector-specific) — deployed instance for green/carbon sector in Argentina.
- **3-source relationship verification**: Websites A + B + Google web search — matches how research agents discover via Perplexity
- **Namespaced storage**: Each industry map (`map_id`) gets its own namespace, so one contract deployment can serve multiple industries

### react-force-graph-2d (not D3 or Cytoscape)
- **Why**: WebGL-accelerated, handles hundreds of nodes smoothly, built-in physics simulation, custom canvas rendering for node badges and glow effects

### Next.js API Routes (not separate backend for verification)
- **Why**: GenLayer SDK calls need to happen server-side (private key management). Next.js API routes run on Vercel's serverless functions — no separate backend needed for the verification flow.

### OpenRouter for Research Agents
- **Why**: Access to 500+ models through one API. Use cheap models (Gemini Flash Lite) for bulk classification, Perplexity Sonar for real-time web search (newsletters, social media, press releases), and expensive models for accuracy when needed.
- **Multi-model pipeline**: Gemini Flash Lite ($0.01/M tokens) for HTML extraction and classification, Perplexity Sonar ($1/M + $5/K searches) for deep internet research, Perplexity Sonar Pro ($3/M + $5/K searches) for partner/relationship discovery.

### Supabase
- **Why**: Free PostgreSQL with realtime subscriptions. When a research agent adds a new node, the frontend could receive it in real-time via Supabase Realtime.

---

## Data Model

### Nodes (Companies/Institutions)
| Field | Description |
|-------|-------------|
| nombre | Company name |
| link | Website/social URL |
| followers | Social media followers |
| cluster | Fondo Verde, Startup, ONG, Empresa Privada, Aceleradora, Government, Organismo Internacional, Consultora |
| categoria | Subcategory (energia renovable, medidora de carbono, etc.) |
| quien_fondea | Funding source (populated by Perplexity Sonar) |
| aliados_portfolio | Partners/portfolio companies |
| clientes | Clients |
| descripcion | Description |
| verified | On-chain verification status |
| verification_tx | GenLayer transaction hash |
| source | "manual" or "agent" |
| depth | Discovery depth (0=seed, 1=direct partner, 2=partner-of-partner) |
| discovery_method | How the node was found: "manual", "website", "perplexity", "perplexity_deep", "llm" |
| discovered_by | UUID of the node that led to this discovery |

### Edges (Relationships)
| Type | Meaning |
|------|---------|
| funds | A funds B |
| partners_with | A and B are partners |
| client_of | A is a client of B |
| portfolio | A is in B's portfolio |
| regulates | A regulates B |

### Edge Metadata
| Field | Description |
|-------|-------------|
| confidence | Discovery confidence: website=0.8, perplexity=0.7, llm=0.4 |
| discovery_method | Source: "website", "perplexity", "perplexity_deep", "llm", "manual" |
| source | "manual" or "agent" |

---

## Impact & Vision

### Short-term (Hackathon)
- Map 380+ organizations in Argentina's green sector (and growing 24/7)
- Track money flows: 119+ nodes with funding sources identified
- Verify data integrity with GenLayer on-chain consensus
- Autonomous research agent discovers new organizations, relationships, and funding from websites + deep internet sources

### Medium-term (3-6 months)
- Research agents discover 1000+ organizations across Latin America
- Real-time monitoring of the ecosystem (new companies, funding rounds, partnerships)
- API for other platforms to query the verified knowledge graph

### Long-term
- The Wikipedia of green ecosystems — community-curated, AI-enriched, blockchain-verified
- Policy tool for governments to understand and optimize their green sector
- Due diligence tool for investors entering the carbon market

---

## Build Process — Step by Step

This documents the chronological build order for the hackathon pitch:

1. **Research Phase** — Manual investigation of 79 companies in Argentina's green sector, stored in spreadsheet with columns: nombre, link, followers, cluster, categoria, quien_fondea, aliados_portfolio, clientes, descripcion
2. **Supabase Setup** — PostgreSQL schema with nodes/edges tables, seeded with manual research data
3. **Frontend v1** — Next.js + react-force-graph-2d, cluster filtering, search, bilingual ES/EN toggle, dark mode
4. **GenLayer Contract** — Wrote and deployed `GreenPanoramaQA` intelligent contract with 3 verification functions (node, social, relationship) using non-deterministic web fetch + LLM consensus
5. **Verification API** — Next.js API routes for submit/poll/result using genlayer-js SDK
6. **Research Agent v1** — Python spider pattern using OpenRouter (Gemini Flash) to scrape company websites and discover new nodes
7. **Research Daemon** — 24/7 Docker daemon on VPS that runs research cycles, deduplicates discoveries, writes to Supabase
8. **GitHub + Vercel** — CI/CD with auto-deploy on push to main
9. **AI Chat Panel** — Natural language graph query interface powered by Gemini 2.0 Flash via OpenRouter
10. **Welcome Overlay** — First-time onboarding explaining the tool
11. **Edge Legend + Filters** — Toggle relationship types on/off
12. **Search Autocomplete** — Dropdown results as you type
13. **Auto-Verification** — Research daemon auto-submits new discoveries to GenLayer, periodic verification passes on unverified nodes
14. **Anti-Spiral Guardrails** — Depth limits, budget caps, weighted random selection, LLM gating to prevent agent from spiraling into irrelevant clusters
15. **Perplexity Deep Research** — Real-time web search via Perplexity Sonar for discovering relationships from newsletters, social media, press releases, conference panels — sources that website scraping misses
16. **Funding Pipeline** — Automated discovery and backfill of funding sources (`quien_fondea`) for all nodes using Perplexity Sonar, with funding edges and investor tracking
17. **Zero-Orphan System** — Atomic node+edge insertion (rollback on failure) + periodic orphan sweep ensures every node has at least one relationship

## User Personas

### Maria — Ecosystem Newcomer
Journalist, student, or entrepreneur curious about Argentina's green sector. Opens the app, sees the welcome overlay, clicks "Preguntar al Ecosistema", asks "Who are the main green funds?" and gets an instant answer with highlighted nodes.

### Lucas — Startup Founder
Already knows some players. Searches for his company, sees who they're connected to, discovers potential partners and investors through the graph. Uses edge type filters to focus on funding relationships.

### Sofia — Policy Researcher
Works at Ministry of Environment. Uses the stats and cluster view to understand ecosystem maturity. Asks the AI "What sectors have few players?" to identify gaps for policy intervention.

---

## Team & Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind 4, react-force-graph-2d |
| Backend | Python FastAPI, OpenRouter API |
| Database | Supabase (PostgreSQL) |
| Blockchain | GenLayer (Studionet) — Intelligent Contracts |
| AI Models | Gemini 2.0 Flash (chat), Gemini Flash Lite (classification), Perplexity Sonar/Pro (deep research) |
| AI Agents | Multi-source spider (websites + Perplexity web search), fuzzy dedup, atomic insertion, orphan prevention, 24/7 Docker daemon |
| Deployment | Vercel (frontend), Hostinger VPS + Docker (research agent), GitHub CI/CD |

## Links
- **Live App**: https://green-panorama-ar.vercel.app
- **GitHub**: https://github.com/DanteDia/argentina-green-panorama
- **GenLayer Contract**: Deployed on GenLayer Studionet
- **Hackathon**: Aleph March '26 (Buenos Aires)
