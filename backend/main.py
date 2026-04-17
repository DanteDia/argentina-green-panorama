import asyncio
import json
import os
from dataclasses import asdict
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="Green Panorama API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load seed data as fallback (before Supabase is set up)
SEED_DATA_PATH = Path(__file__).parent / "seed" / "seed_data.json"


def load_seed_data():
    with open(SEED_DATA_PATH) as f:
        return json.load(f)


# --- Supabase client (lazy init) ---
_supabase = None


def get_supabase():
    global _supabase
    if _supabase is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY")
        if url and key:
            from supabase import create_client

            _supabase = create_client(url, key)
    return _supabase


@app.get("/")
def root():
    return {"status": "ok", "name": "Green Panorama API"}


@app.get("/api/graph")
def get_graph():
    """Return all nodes and edges for the graph visualization."""
    supabase = get_supabase()

    if supabase:
        try:
            nodes_resp = supabase.table("nodes").select("*").execute()
            edges_resp = supabase.table("edges").select("*").execute()
            return {"nodes": nodes_resp.data, "edges": edges_resp.data}
        except Exception:
            pass

    # Fallback to seed data
    data = load_seed_data()
    # Add IDs to seed nodes
    nodes = []
    for i, node in enumerate(data["nodes"]):
        node["id"] = str(i + 1)
        node["verified"] = False
        node["verification_tx"] = None
        node["source"] = "manual"
        nodes.append(node)

    # Resolve edge references by name
    name_to_id = {n["nombre"]: n["id"] for n in nodes}
    edges = []
    for i, edge in enumerate(data["edges"]):
        source_id = name_to_id.get(edge["source"])
        target_id = name_to_id.get(edge["target"])
        if source_id and target_id:
            edges.append(
                {
                    "id": str(i + 1),
                    "source_id": source_id,
                    "target_id": target_id,
                    "relationship_type": edge["type"],
                    "description": edge.get("description", ""),
                    "confidence": 1.0,
                    "source": "manual",
                }
            )

    return {"nodes": nodes, "edges": edges}


@app.get("/api/nodes")
def get_nodes():
    """Return all nodes."""
    supabase = get_supabase()
    if supabase:
        try:
            resp = supabase.table("nodes").select("*").execute()
            return {"nodes": resp.data}
        except Exception:
            pass

    data = load_seed_data()
    return {"nodes": data["nodes"]}


@app.get("/api/nodes/{node_id}")
def get_node(node_id: str):
    """Return a single node by ID."""
    supabase = get_supabase()
    if supabase:
        try:
            resp = supabase.table("nodes").select("*").eq("id", node_id).single().execute()
            return resp.data
        except Exception:
            pass
    return {"error": "not_found"}


@app.get("/api/edges")
def get_edges():
    """Return all edges."""
    supabase = get_supabase()
    if supabase:
        try:
            resp = supabase.table("edges").select("*").execute()
            return {"edges": resp.data}
        except Exception:
            pass

    data = load_seed_data()
    return {"edges": data["edges"]}


@app.get("/api/stats")
def get_stats():
    """Return graph statistics."""
    graph = get_graph()
    nodes = graph["nodes"]
    edges = graph["edges"]

    cluster_counts = {}
    for node in nodes:
        cluster = node.get("cluster", "Unknown")
        cluster_counts[cluster] = cluster_counts.get(cluster, 0) + 1

    verified_count = sum(1 for n in nodes if n.get("verified"))

    return {
        "total_nodes": len(nodes),
        "total_edges": len(edges),
        "verified_nodes": verified_count,
        "cluster_counts": cluster_counts,
    }


@app.get("/api/agents/status")
def get_agent_status():
    """Return KiloClaw agent status and statistics."""
    state_file = Path(__file__).parent / "data" / "kiloclaw_state.json"
    log_file = Path(__file__).parent / "data" / "kiloclaw_log.jsonl"

    state = {}
    if state_file.exists():
        with open(state_file) as f:
            state = json.load(f)

    # Read last 20 log entries
    recent_logs = []
    if log_file.exists():
        with open(log_file) as f:
            lines = f.readlines()
            for line in lines[-20:]:
                try:
                    recent_logs.append(json.loads(line.strip()))
                except Exception:
                    pass

    # Get agent-discovered counts from Supabase
    supabase = get_supabase()
    agent_nodes = 0
    agent_edges = 0
    if supabase:
        try:
            nodes_resp = supabase.table("nodes").select("id").eq("source", "agent").execute()
            edges_resp = supabase.table("edges").select("id").eq("source", "agent").execute()
            agent_nodes = len(nodes_resp.data)
            agent_edges = len(edges_resp.data)
        except Exception:
            pass

    return {
        "visited_companies": len(state.get("visited", [])),
        "agent_nodes_added": agent_nodes,
        "agent_edges_added": agent_edges,
        "recent_activity": recent_logs,
    }


@app.post("/api/agents/research/run")
async def run_research_agent(max_companies: int = 3):
    """Trigger the research agent to spider companies and discover new nodes."""
    from agents.research_agent import run_research_cycle

    results = await run_research_cycle(max_companies=max_companies)

    total_new = sum(len(r.discovered_nodes) for r in results)
    all_discovered = []

    for r in results:
        for node in r.discovered_nodes:
            all_discovered.append({
                "nombre": node.nombre,
                "link": node.link,
                "cluster": node.cluster,
                "categoria": node.categoria,
                "descripcion": node.descripcion,
                "relationship_to": r.source_company,
                "relationship_type": node.relationship_type,
            })

            # If Supabase is available, insert the new node
            supabase = get_supabase()
            if supabase:
                try:
                    node_resp = supabase.table("nodes").insert({
                        "nombre": node.nombre,
                        "link": node.link,
                        "cluster": node.cluster,
                        "categoria": node.categoria,
                        "descripcion": node.descripcion,
                        "source": "agent",
                    }).execute()
                except Exception:
                    pass

    return {
        "companies_spidered": len(results),
        "new_nodes_discovered": total_new,
        "discovered": all_discovered,
    }


# =============================================================================
# Outbound marketing — BD contact discovery + personalized message drafting
# =============================================================================


class OutboundRequest(BaseModel):
    sponsor_name: str
    sponsor_summary: str = ""
    attendee_company: str = ""
    attendee_summary: str = ""
    synergy_reasoning: str = ""
    event_name: str = "BlockchainRio 2026"
    max_contacts: int = 5
    generate_messages: bool = True


@app.post("/api/outbound/bd-contacts")
async def outbound_bd_contacts(req: OutboundRequest):
    """Find BD humans for `sponsor_name` and, if requested, draft outbound
    messages tailored to the attendee's company.

    Runs on the VPS (Scrapling needs Playwright + Chromium).
    Best-effort: errors are surfaced in the response body, never as 5xx.
    """
    from agents.bd_contact_finder import find_bd_contacts
    from agents.outbound_writer import (
        OutboundContext,
        as_dict as messages_as_dict,
        generate_messages,
    )

    if not req.sponsor_name.strip():
        raise HTTPException(status_code=400, detail="sponsor_name is required")

    search = await find_bd_contacts(req.sponsor_name, max_per_platform=req.max_contacts)
    people = [asdict(p) for p in search.people][: req.max_contacts]

    messages = None
    if req.generate_messages and req.attendee_company and req.synergy_reasoning:
        top = search.people[0] if search.people else None
        ctx = OutboundContext(
            attendee_company=req.attendee_company,
            attendee_summary=req.attendee_summary,
            sponsor_company=req.sponsor_name,
            sponsor_summary=req.sponsor_summary,
            synergy_reasoning=req.synergy_reasoning,
            event_name=req.event_name,
            bd_person_name=top.name if top else None,
            bd_person_title=top.title if top else None,
        )
        msgs = await asyncio.to_thread(generate_messages, ctx)
        messages = messages_as_dict(msgs)

    return {
        "company": search.company,
        "people": people,
        "messages": messages,
        "errors": search.errors,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
