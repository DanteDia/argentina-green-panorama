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

### Step 1: The Graph
- Open green-panorama-ar.vercel.app
- 79 nodes representing real companies/institutions in Argentina's green sector
- 47 edges showing real relationships (funding, partnerships, clients)
- Color-coded by cluster: Funds (green), Startups (lime), NGOs (orange), Private (blue), Accelerators (purple), Government (red), International (cyan)
- Force-directed physics — nodes cluster naturally by relationships

### Step 2: Explore a Node
- Click any node (e.g., Antom, Ruuts, Kilimo)
- Detail panel shows: cluster, category, website, followers, description, funding sources, partners, clients
- See all connections — who funds them, who they partner with, who their clients are
- Navigate the graph by clicking connected nodes

### Step 3: On-Chain Verification with GenLayer
- Click "Verificar en GenLayer" on any unverified node
- The GenLayer intelligent contract:
  1. Fetches the company's website in real-time
  2. Uses AI (multi-validator consensus with different LLMs) to verify:
     - Does the company exist?
     - Is it related to Argentina?
     - Is it in the green sector?
     - Is the description accurate?
  3. Stores the result on-chain with a transaction hash
- Validators: Claude Sonnet 4.5, GPT-5.1, Gemini 3 Flash, Mistral Large, Kimi K2
- Result: green badge on the node + verification details in the panel

### Step 4: Social Media Audit
- For nodes with social media links (Instagram, LinkedIn, Twitter)
- Click "Auditar Redes Sociales"
- Contract verifies: is the account real? Does it belong to this company? Are follower counts accurate? Is the account active or dead?
- Result: per-platform audit with follower match indicators

### Step 5: Batch Verification
- Click "Verificar Nodos" in the sidebar
- Automatically verifies 5 nodes at once
- Watch the graph light up with pulsing amber badges (pending) turning green (verified)

### Step 6: AI Research Agents (24/7)
- Research agent spiders company websites
- Discovers new partners, clients, and funders
- Extracts structured data: name, cluster, category, description, relationships
- Adds new nodes and edges to the graph automatically
- Each new discovery gets auto-verified via GenLayer

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

## Team & Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind 4, react-force-graph-2d |
| Backend | Python FastAPI, OpenRouter API |
| Database | Supabase (PostgreSQL) |
| Blockchain | GenLayer (Studionet) — Intelligent Contracts |
| AI Agents | Spider pattern, Gemini Flash via OpenRouter |
| Deployment | Vercel (frontend), GitHub (DanteDia/argentina-green-panorama) |

## Links
- **Live App**: https://green-panorama-ar.vercel.app
- **GitHub**: https://github.com/DanteDia/argentina-green-panorama
- **GenLayer Contract**: https://studio.genlayer.com/?import-contract=0x57C566b552e528d86b230de35dbd847476f829c4
- **Hackathon**: Aleph March '26 (Buenos Aires)
