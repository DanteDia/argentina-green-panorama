import json
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
        key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY")
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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
