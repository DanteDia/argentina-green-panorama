# Green Panorama - Pitch Documentation

## One-Liner
Interactive AI-powered map of Argentina's green ecosystem with on-chain verification via GenLayer intelligent contracts.

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
                              |         (Studionet)
                         FastAPI Backend     |
                         (Research Agents)   |
                              |         GreenPanoramaQA
                         Supabase        Intelligent Contract
                         (PostgreSQL)    - verify_node()
                                         - verify_social()
                                         - verify_relationship()
```

---

## Hero Steps (Demo Flow)

### Step 1: Welcome & Onboarding
- Open green-panorama-ar.vercel.app
- First-time visitors see a welcome overlay explaining:
  - What Green Panorama is (interactive map of 79+ green organizations)
  - How nodes and connections work
  - What blockchain verification means
- Two entry points: "Explorar el Mapa" or "Preguntar al Ecosistema"

### Step 2: The Graph
- 79+ nodes representing real companies/institutions in Argentina's green sector
- 49+ edges showing real relationships (funding, partnerships, clients)
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
- The GenLayer intelligent contract:
  1. Fetches the company's website in real-time
  2. Uses AI (multi-validator consensus with 5 different LLMs) to verify:
     - Does the company exist?
     - Is it related to Argentina?
     - Is it in the green sector?
     - Is the description accurate?
  3. Stores the result on-chain with a transaction hash
- Validators use different LLMs for diversity of judgment
- Result: green badge on the node + verification details in the panel + Supabase updated

### Step 6: Social Media Audit
- For nodes with social media links (Instagram, LinkedIn, Twitter)
- Click "Auditar Redes Sociales"
- Contract verifies: is the account real? Does it belong to this company? Are follower counts accurate? Is the account active or dead?
- Result: per-platform audit with follower match indicators

### Step 7: Batch Verification
- Click "Verificar Nodos" in the sidebar
- Automatically verifies 5 nodes at once
- Watch the graph light up with pulsing amber badges (pending) turning green (verified)

### Step 8: AI Research Agents (24/7)
- Research daemon runs continuously (every 10 minutes)
- Spiders company websites using LLM to discover new partners, clients, and funders
- Extracts structured data: name, cluster, category, description, relationships
- Deduplicates against existing nodes using fuzzy name matching
- Adds new nodes and edges to Supabase with `source="agent"`
- **Auto-verification**: after adding new nodes, automatically submits to GenLayer for verification
- Periodic verification pass: every 3rd cycle, verifies any remaining unverified nodes
- Feedback loop: failed verifications are logged for manual review and data improvement

---

## Technical Decisions & Why

### GenLayer (not a regular smart contract)
- **Why**: Traditional smart contracts can't fetch websites or use AI reasoning. GenLayer's intelligent contracts can do both via `gl.nondet.web.get()` and `gl.nondet.exec_prompt()`.
- **Consensus**: `prompt_non_comparative` — leader validator does the work, other validators judge if the result is reasonable. More reliable than requiring identical outputs from different LLMs.
- **Contract address**: `0x57C566b552e528d86b230de35dbd847476f829c4` on Studionet

### react-force-graph-2d (not D3 or Cytoscape)
- **Why**: WebGL-accelerated, handles hundreds of nodes smoothly, built-in physics simulation, custom canvas rendering for node badges and glow effects

### Next.js API Routes (not separate backend for verification)
- **Why**: GenLayer SDK calls need to happen server-side (private key management). Next.js API routes run on Vercel's serverless functions — no separate backend needed for the verification flow.

### OpenRouter for Research Agents
- **Why**: Access to 500+ models through one API. Use cheap models (Gemini Flash) for bulk research, expensive models (Claude/GPT) for accuracy. Cost: ~$0.25/M tokens.

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
| quien_fondea | Funding source |
| aliados_portfolio | Partners/portfolio companies |
| clientes | Clients |
| descripcion | Description |
| verified | On-chain verification status |
| verification_tx | GenLayer transaction hash |
| source | "manual" or "agent" |

### Edges (Relationships)
| Type | Meaning |
|------|---------|
| funds | A funds B |
| partners_with | A and B are partners |
| client_of | A is a client of B |
| portfolio | A is in B's portfolio |
| regulates | A regulates B |

---

## Impact & Vision

### Short-term (Hackathon)
- Map 100+ organizations in Argentina's green sector
- Verify data integrity with GenLayer on-chain consensus
- Provide a research tool for newcomers to understand the ecosystem

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
6. **Research Agent** — Python spider pattern using OpenRouter (Gemini Flash) to scrape company websites and discover new nodes
7. **KiloClaw / Daemon** — 24/7 research daemon that runs cycles, deduplicates discoveries, writes to Supabase
8. **GitHub + Vercel** — CI/CD with auto-deploy on push to main
9. **AI Chat Panel** — Natural language graph query interface powered by Gemini 2.0 Flash via OpenRouter
10. **Welcome Overlay** — First-time onboarding explaining the tool
11. **Edge Legend + Filters** — Toggle relationship types on/off
12. **Search Autocomplete** — Dropdown results as you type
13. **Auto-Verification** — Research daemon auto-submits new discoveries to GenLayer, periodic verification passes on unverified nodes

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
| AI Models | Gemini 2.0 Flash (chat), Gemini 3.1 Flash Lite (research) |
| AI Agents | Spider pattern with fuzzy dedup, 24/7 daemon |
| Deployment | Vercel (frontend), GitHub CI/CD |

## Links
- **Live App**: https://green-panorama-ar.vercel.app
- **GitHub**: https://github.com/DanteDia/argentina-green-panorama
- **GenLayer Contract**: https://studio.genlayer.com/?import-contract=0x57C566b552e528d86b230de35dbd847476f829c4
- **Hackathon**: Aleph March '26 (Buenos Aires)
