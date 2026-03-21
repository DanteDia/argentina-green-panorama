"""
Backfill relationships for all nodes via Perplexity deep discovery.

Focuses on nodes with few connections (0-1 edges), finding relationships
from newsletters, press releases, social media, event reports.

Run:
  python -m agents.backfill_relationships              # All under-connected nodes
  python -m agents.backfill_relationships --limit 20   # First 20 only
  python -m agents.backfill_relationships --dry-run    # Preview without writing
  python -m agents.backfill_relationships --min-conn 2 # Nodes with <2 connections
"""

import argparse
import json
import logging
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from agents.db_helpers import get_supabase, check_duplicate, log_event
from agents.funding_researcher import discover_relationships_deep
from agents.research_agent import research_company

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("backfill_relationships")

MAX_AGENT_NODES = 500


def insert_edge_direct(sb, source_name, target_name, rel_type, discovery_method="perplexity_deep", confidence=0.7):
    """Insert an edge, resolving names to IDs. Returns True on success."""
    source_resp = sb.table("nodes").select("id").eq("nombre", source_name).execute()
    target_resp = sb.table("nodes").select("id").eq("nombre", target_name).execute()

    if not source_resp.data or not target_resp.data:
        return False

    source_id = source_resp.data[0]["id"]
    target_id = target_resp.data[0]["id"]

    # Check both directions
    existing = (
        sb.table("edges").select("id")
        .eq("source_id", source_id)
        .eq("target_id", target_id)
        .execute()
    )
    if existing.data:
        return False
    existing_rev = (
        sb.table("edges").select("id")
        .eq("source_id", target_id)
        .eq("target_id", source_id)
        .execute()
    )
    if existing_rev.data:
        return False

    row = {
        "source_id": source_id,
        "target_id": target_id,
        "relationship_type": rel_type,
        "description": f"{source_name} {rel_type} {target_name}",
        "confidence": confidence,
        "source": "agent",
        "discovery_method": discovery_method,
    }

    try:
        resp = sb.table("edges").insert(row).execute()
        return bool(resp.data)
    except Exception as e:
        log.error(f"  Edge insert failed: {e}")
        return False


def backfill(limit: int | None = None, dry_run: bool = False, min_connections: int = 2):
    sb = get_supabase()

    # Get all nodes
    nodes_resp = sb.table("nodes").select("id, nombre, link, cluster, depth").execute()
    edges_resp = sb.table("edges").select("source_id, target_id").execute()

    # Count connections per node
    connections = Counter()
    for e in edges_resp.data:
        connections[e["source_id"]] += 1
        connections[e["target_id"]] += 1

    id_to_name = {n["id"]: n["nombre"] for n in nodes_resp.data}
    all_names = [n["nombre"] for n in nodes_resp.data]
    all_names_lower = {n.lower() for n in all_names}

    # Find under-connected nodes, prioritize orphans first
    under_connected = []
    for n in nodes_resp.data:
        conn_count = connections.get(n["id"], 0)
        if conn_count < min_connections:
            under_connected.append((n, conn_count))

    # Sort: orphans first, then 1-connection, etc.
    under_connected.sort(key=lambda x: x[1])

    log.info(f"Total nodes: {len(nodes_resp.data)}, Total edges: {len(edges_resp.data)}")
    log.info(f"Avg connections: {sum(connections.values()) / len(nodes_resp.data):.2f}")
    log.info(f"Under-connected (<{min_connections} connections): {len(under_connected)}")

    if limit:
        under_connected = under_connected[:limit]
        log.info(f"Processing first {limit}")

    # Get agent node count for budget
    agent_count = sum(1 for n in nodes_resp.data if n.get("source") == "agent")

    stats = {"searched": 0, "new_edges": 0, "new_nodes": 0, "no_results": 0}

    for i, (node, conn_count) in enumerate(under_connected, 1):
        nombre = node["nombre"]
        url = node.get("link")
        log.info(f"[{i}/{len(under_connected)}] {nombre} (current connections: {conn_count})")

        relationships = discover_relationships_deep(nombre, url)

        if not relationships:
            log.info(f"  No relationships found")
            stats["no_results"] += 1
            stats["searched"] += 1
            time.sleep(1)
            continue

        log.info(f"  Found {len(relationships)} relationships")

        for rel in relationships:
            partner_name = rel.get("name", "").strip()
            if not partner_name:
                continue

            partner_url = rel.get("link")
            relationship = rel.get("relationship", "partner")
            evidence = rel.get("evidence", "")

            # Map relationship type
            rel_type = "partners_with"
            if relationship in ("funder", "investor", "co_investor", "backed_by"):
                rel_type = "funds"
            elif relationship in ("client", "customer"):
                rel_type = "client_of"
            elif relationship in ("portfolio", "portfolio_company"):
                rel_type = "portfolio"

            if dry_run:
                log.info(f"  [DRY RUN] {nombre} --{rel_type}--> {partner_name} ({evidence[:60]})")
                stats["new_edges"] += 1
                continue

            # Check if partner exists as a node
            if partner_name.lower() in all_names_lower:
                # Find exact name (case-insensitive match)
                exact_name = next((n for n in all_names if n.lower() == partner_name.lower()), partner_name)
                if insert_edge_direct(sb, nombre, exact_name, rel_type):
                    stats["new_edges"] += 1
                    log.info(f"  + Edge: {nombre} --{rel_type}--> {exact_name} [{evidence[:60]}]")
                continue

            # Check fuzzy dedup
            is_dup, match, score = check_duplicate(partner_name, all_names)
            if is_dup:
                if insert_edge_direct(sb, nombre, match, rel_type):
                    stats["new_edges"] += 1
                    log.info(f"  + Edge: {nombre} --{rel_type}--> {match} (fuzzy match) [{evidence[:60]}]")
                continue

            # New company — research and create if budget allows
            if agent_count >= MAX_AGENT_NODES:
                continue

            classified = research_company(partner_name, partner_url)
            if classified:
                depth = min((node.get("depth") or 0) + 1, 2)
                row = {
                    "nombre": classified.nombre,
                    "link": classified.link,
                    "cluster": classified.cluster or "Startup",
                    "categoria": classified.categoria or "",
                    "descripcion": classified.descripcion or "",
                    "source": "agent",
                    "quien_fondea": getattr(classified, "quien_fondea", "") or "",
                    "aliados_portfolio": [],
                    "clientes": [],
                    "depth": depth,
                    "discovery_method": "perplexity_deep",
                }
                try:
                    insert_resp = sb.table("nodes").insert(row).execute()
                    if insert_resp.data:
                        stats["new_nodes"] += 1
                        agent_count += 1
                        all_names.append(partner_name)
                        all_names_lower.add(partner_name.lower())

                        if insert_edge_direct(sb, nombre, classified.nombre, rel_type):
                            stats["new_edges"] += 1
                        log.info(f"  + New node + edge: {nombre} --{rel_type}--> {classified.nombre} [{evidence[:60]}]")
                except Exception as e:
                    log.error(f"  Insert failed for {partner_name}: {e}")

        stats["searched"] += 1
        time.sleep(1)  # Rate limit

    log.info(f"\n=== Relationship Backfill Complete ===")
    log.info(f"Nodes searched: {stats['searched']}")
    log.info(f"New edges: {stats['new_edges']}")
    log.info(f"New nodes: {stats['new_nodes']}")
    log.info(f"No results: {stats['no_results']}")
    if dry_run:
        log.info("(DRY RUN - no writes)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill relationships for under-connected nodes")
    parser.add_argument("--limit", type=int, default=None, help="Max nodes to process")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    parser.add_argument("--min-conn", type=int, default=2, help="Process nodes with fewer than N connections (default: 2)")
    args = parser.parse_args()

    backfill(limit=args.limit, dry_run=args.dry_run, min_connections=args.min_conn)
