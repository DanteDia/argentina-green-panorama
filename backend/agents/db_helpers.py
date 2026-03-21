"""
Green Panorama - Database CLI Helpers for OpenClaw Agent

This module provides CLI commands that the OpenClaw agent calls via shell
to interact with the Supabase database.

Usage:
  python db_helpers.py next-company              # Get next unvisited company
  python db_helpers.py check-dup "Company Name"  # Check for duplicates
  python db_helpers.py add-node --nombre "X" --cluster "Startup" ...
  python db_helpers.py add-edge --source "A" --target "B" --type "partners_with"
  python db_helpers.py mark-visited "Company Name"
  python db_helpers.py stats                      # Show database stats
  python db_helpers.py list-unvisited             # List all unvisited companies
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Local state file for tracking visited companies and queue
STATE_FILE = Path(__file__).parent.parent / "data" / "kiloclaw_state.json"
LOG_FILE = Path(__file__).parent.parent / "data" / "kiloclaw_log.jsonl"

VALID_CLUSTERS = [
    "Empresa Privada", "ONG", "Fondo Verde", "Aceleradora",
    "Organismo Internacional", "Consultora", "Startup", "Government",
]

VALID_RELATIONSHIP_TYPES = [
    "funds", "partners_with", "client_of", "portfolio", "regulates",
]


def get_supabase():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_KEY must be set in backend/.env")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_KEY)


# --- Fuzzy Deduplication ---

def normalize_name(name: str) -> str:
    """Normalize company name for comparison."""
    name = name.lower().strip()
    for suffix in [
        " s.a.", " s.a", " sa", " s.r.l.", " srl", " argentina",
        " inc", " ltd", " llc", " corp", " foundation", " fundacion",
        " fundación",
    ]:
        if name.endswith(suffix):
            name = name[: -len(suffix)].strip()
    name = re.sub(r"[^a-záéíóúñü0-9\s]", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def similarity(a: str, b: str) -> float:
    """Compute name similarity using SequenceMatcher + heuristics."""
    na, nb = normalize_name(a), normalize_name(b)
    if na == nb:
        return 1.0
    if na in nb or nb in na:
        return 0.9
    return SequenceMatcher(None, na, nb).ratio()


def check_duplicate(candidate: str, known_names: list[str], threshold: float = 0.75):
    """Check if candidate is a duplicate. Returns (is_dup, best_match, score)."""
    best_match = None
    best_score = 0.0
    for known in known_names:
        score = similarity(candidate, known)
        if score > best_score:
            best_score = score
            best_match = known
    return best_score >= threshold, best_match, best_score


# --- State Management ---

def load_state() -> dict:
    """Load the local state file."""
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"visited": [], "queue": [], "stats": {"total_added": 0, "total_edges": 0}}


def save_state(state: dict):
    """Save state to local file."""
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2, default=str)


def log_event(event: str, **data):
    """Append a log entry."""
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    entry = {"ts": datetime.now(timezone.utc).isoformat(), "event": event, **data}
    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(entry) + "\n")


# --- CLI Commands ---

def cmd_next_company():
    """Get the next unvisited company to research."""
    sb = get_supabase()
    state = load_state()
    visited = set(state.get("visited", []))

    # Get all nodes with real URLs (not Instagram-only)
    resp = sb.table("nodes").select("nombre, link, cluster").execute()
    candidates = []
    for node in resp.data:
        if node["nombre"] in visited:
            continue
        link = node.get("link", "") or ""
        # Prioritize nodes with scrapeable URLs
        if link and "instagram.com" not in link:
            candidates.insert(0, node)
        elif link:
            candidates.append(node)

    if not candidates:
        print(json.dumps({"status": "exhausted", "message": "All companies have been visited"}))
        return

    next_co = candidates[0]
    print(json.dumps({
        "status": "ok",
        "nombre": next_co["nombre"],
        "link": next_co.get("link"),
        "cluster": next_co.get("cluster"),
        "remaining": len(candidates) - 1,
    }))


def cmd_check_dup(name: str):
    """Check if a company name is a duplicate."""
    sb = get_supabase()
    resp = sb.table("nodes").select("nombre").execute()
    known = [n["nombre"] for n in resp.data]

    is_dup, match, score = check_duplicate(name, known)
    print(json.dumps({
        "is_duplicate": is_dup,
        "best_match": match,
        "similarity_score": round(score, 3),
        "candidate": name,
    }))


def cmd_add_node(args):
    """Add a new node to Supabase."""
    sb = get_supabase()

    # Validate cluster
    cluster = args.cluster
    if cluster not in VALID_CLUSTERS:
        print(f"WARNING: '{cluster}' is not a standard cluster. Valid: {VALID_CLUSTERS}")

    # Check for duplicates first
    resp = sb.table("nodes").select("nombre").execute()
    known = [n["nombre"] for n in resp.data]
    is_dup, match, score = check_duplicate(args.nombre, known)
    if is_dup:
        print(json.dumps({
            "status": "duplicate",
            "message": f"'{args.nombre}' matches existing '{match}' (score={score:.2f})",
        }))
        return

    row = {
        "nombre": args.nombre,
        "link": args.link,
        "cluster": cluster,
        "categoria": args.categoria or "",
        "descripcion": args.descripcion or "",
        "source": "agent",
        "quien_fondea": args.quien_fondea or "",
        "aliados_portfolio": [],
        "clientes": [],
    }

    resp = sb.table("nodes").insert(row).execute()
    if resp.data:
        node_id = resp.data[0]["id"]
        state = load_state()
        state["stats"]["total_added"] = state["stats"].get("total_added", 0) + 1
        save_state(state)
        log_event("new_node", nombre=args.nombre, cluster=cluster, discovered_from=args.discovered_from or "")
        print(json.dumps({
            "status": "ok",
            "id": node_id,
            "nombre": args.nombre,
            "cluster": cluster,
        }))
    else:
        print(json.dumps({"status": "error", "message": "Insert failed"}))


def cmd_add_edge(args):
    """Add a new edge between two nodes."""
    sb = get_supabase()

    if args.type not in VALID_RELATIONSHIP_TYPES:
        print(f"WARNING: '{args.type}' is not standard. Valid: {VALID_RELATIONSHIP_TYPES}")

    # Resolve node names to IDs
    source_resp = sb.table("nodes").select("id, nombre").eq("nombre", args.source).execute()
    target_resp = sb.table("nodes").select("id, nombre").eq("nombre", args.target).execute()

    if not source_resp.data:
        print(json.dumps({"status": "error", "message": f"Source node '{args.source}' not found"}))
        return
    if not target_resp.data:
        print(json.dumps({"status": "error", "message": f"Target node '{args.target}' not found"}))
        return

    source_id = source_resp.data[0]["id"]
    target_id = target_resp.data[0]["id"]

    # Check if edge already exists
    existing = (
        sb.table("edges")
        .select("id")
        .eq("source_id", source_id)
        .eq("target_id", target_id)
        .execute()
    )
    if existing.data:
        print(json.dumps({"status": "exists", "message": "Edge already exists"}))
        return

    row = {
        "source_id": source_id,
        "target_id": target_id,
        "relationship_type": args.type,
        "description": args.description or f"{args.source} {args.type} {args.target}",
        "confidence": args.confidence or 0.8,
        "source": "agent",
    }

    resp = sb.table("edges").insert(row).execute()
    if resp.data:
        state = load_state()
        state["stats"]["total_edges"] = state["stats"].get("total_edges", 0) + 1
        save_state(state)
        log_event("new_edge", source=args.source, target=args.target, type=args.type)
        print(json.dumps({
            "status": "ok",
            "id": resp.data[0]["id"],
            "source": args.source,
            "target": args.target,
            "type": args.type,
        }))
    else:
        print(json.dumps({"status": "error", "message": "Insert failed"}))


def cmd_mark_visited(name: str):
    """Mark a company as visited/researched."""
    state = load_state()
    if name not in state.get("visited", []):
        state.setdefault("visited", []).append(name)
        save_state(state)
        log_event("mark_visited", company=name)
    print(json.dumps({"status": "ok", "company": name, "total_visited": len(state["visited"])}))


def cmd_list_unvisited():
    """List all unvisited companies."""
    sb = get_supabase()
    state = load_state()
    visited = set(state.get("visited", []))

    resp = sb.table("nodes").select("nombre, link, cluster").execute()
    unvisited = [n for n in resp.data if n["nombre"] not in visited]

    # Sort: scrapeable URLs first
    scrapeable = [n for n in unvisited if n.get("link") and "instagram.com" not in (n["link"] or "")]
    instagram = [n for n in unvisited if n.get("link") and "instagram.com" in (n["link"] or "")]
    no_link = [n for n in unvisited if not n.get("link")]

    print(json.dumps({
        "total_unvisited": len(unvisited),
        "scrapeable": len(scrapeable),
        "instagram_only": len(instagram),
        "no_link": len(no_link),
        "next_5": [n["nombre"] for n in (scrapeable + instagram + no_link)[:5]],
    }))


def cmd_stats():
    """Show database and agent statistics."""
    sb = get_supabase()
    state = load_state()

    nodes_resp = sb.table("nodes").select("id, source, cluster, depth, discovery_method", count="exact").execute()
    edges_resp = sb.table("edges").select("id, source", count="exact").execute()

    manual_nodes = sum(1 for n in nodes_resp.data if n.get("source") == "manual")
    agent_nodes = sum(1 for n in nodes_resp.data if n.get("source") == "agent")
    manual_edges = sum(1 for e in edges_resp.data if e.get("source") == "manual")
    agent_edges = sum(1 for e in edges_resp.data if e.get("source") == "agent")

    cluster_counts = {}
    depth_counts = {}
    method_counts = {}
    for n in nodes_resp.data:
        c = n.get("cluster", "Unknown")
        cluster_counts[c] = cluster_counts.get(c, 0) + 1
        d = str(n.get("depth", 0))
        depth_counts[d] = depth_counts.get(d, 0) + 1
        m = n.get("discovery_method", "manual")
        method_counts[m] = method_counts.get(m, 0) + 1

    print(json.dumps({
        "total_nodes": nodes_resp.count,
        "manual_nodes": manual_nodes,
        "agent_nodes": agent_nodes,
        "agent_budget_remaining": 500 - agent_nodes,
        "total_edges": edges_resp.count,
        "manual_edges": manual_edges,
        "agent_edges": agent_edges,
        "visited_companies": len(state.get("visited", [])),
        "clusters": cluster_counts,
        "depth_distribution": depth_counts,
        "discovery_methods": method_counts,
    }, indent=2))


def main():
    parser = argparse.ArgumentParser(description="Green Panorama DB Helpers for OpenClaw")
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("next-company", help="Get next unvisited company")
    sub.add_parser("stats", help="Show database statistics")
    sub.add_parser("list-unvisited", help="List unvisited companies")

    dup_parser = sub.add_parser("check-dup", help="Check for duplicate names")
    dup_parser.add_argument("name", help="Company name to check")

    visit_parser = sub.add_parser("mark-visited", help="Mark company as visited")
    visit_parser.add_argument("name", help="Company name")

    node_parser = sub.add_parser("add-node", help="Add a new node")
    node_parser.add_argument("--nombre", required=True, help="Company name")
    node_parser.add_argument("--cluster", required=True, help="Cluster type")
    node_parser.add_argument("--link", default=None, help="Website URL")
    node_parser.add_argument("--categoria", default=None, help="Category")
    node_parser.add_argument("--descripcion", default=None, help="Description in Spanish")
    node_parser.add_argument("--quien-fondea", default=None, help="Who funds this company")
    node_parser.add_argument("--discovered-from", default=None, help="Source company")

    edge_parser = sub.add_parser("add-edge", help="Add a new edge")
    edge_parser.add_argument("--source", required=True, help="Source node name")
    edge_parser.add_argument("--target", required=True, help="Target node name")
    edge_parser.add_argument("--type", required=True, help="Relationship type")
    edge_parser.add_argument("--description", default=None, help="Edge description")
    edge_parser.add_argument("--confidence", type=float, default=0.8, help="Confidence 0-1")

    args = parser.parse_args()

    if args.command == "next-company":
        cmd_next_company()
    elif args.command == "check-dup":
        cmd_check_dup(args.name)
    elif args.command == "add-node":
        cmd_add_node(args)
    elif args.command == "add-edge":
        cmd_add_edge(args)
    elif args.command == "mark-visited":
        cmd_mark_visited(args.name)
    elif args.command == "list-unvisited":
        cmd_list_unvisited()
    elif args.command == "stats":
        cmd_stats()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
