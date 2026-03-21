"""
Green Panorama Research Daemon

Standalone daemon that runs research cycles in a loop:
- Picks the next unvisited company from Supabase
- Scrapes its website for partners/aliados
- Uses LLM to extract and classify new companies
- Deduplicates against existing nodes
- Writes new discoveries to Supabase

Run:
  python -m agents.research_daemon          # Run continuously (every 10 min)
  python -m agents.research_daemon --once   # Run a single cycle then exit
  python -m agents.research_daemon --interval 300  # Every 5 minutes
"""

import argparse
import asyncio
import json
import logging
import signal
import sys
import time
from pathlib import Path

# Add parent to path so we can import agents modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from agents.db_helpers import (
    check_duplicate,
    cmd_mark_visited,
    get_supabase,
    load_state,
    log_event,
    save_state,
)
from agents.research_agent import spider_company

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("research_daemon")

# Graceful shutdown
_running = True


def _handle_signal(signum, frame):
    global _running
    log.info(f"Received signal {signum}, shutting down gracefully...")
    _running = False


signal.signal(signal.SIGTERM, _handle_signal)
signal.signal(signal.SIGINT, _handle_signal)


def get_next_company() -> dict | None:
    """Get the next unvisited company with a scrapeable URL."""
    sb = get_supabase()
    state = load_state()
    visited = set(state.get("visited", []))

    resp = sb.table("nodes").select("nombre, link, cluster").execute()
    candidates = []
    for node in resp.data:
        if node["nombre"] in visited:
            continue
        link = node.get("link", "") or ""
        if link and "instagram.com" not in link:
            candidates.insert(0, node)
        elif link:
            candidates.append(node)

    if not candidates:
        return None

    return candidates[0]


def get_all_names() -> list[str]:
    """Get all existing node names for dedup."""
    sb = get_supabase()
    resp = sb.table("nodes").select("nombre").execute()
    return [n["nombre"] for n in resp.data]


def insert_node(node, discovered_from: str) -> str | None:
    """Insert a discovered node into Supabase. Returns node ID or None."""
    sb = get_supabase()

    row = {
        "nombre": node.nombre,
        "link": node.link,
        "cluster": node.cluster or "Startup",
        "categoria": node.categoria or "",
        "descripcion": node.descripcion or "",
        "source": "agent",
        "quien_fondea": "",
        "aliados_portfolio": [],
        "clientes": [],
    }

    try:
        resp = sb.table("nodes").insert(row).execute()
        if resp.data:
            node_id = resp.data[0]["id"]
            log_event("new_node", nombre=node.nombre, cluster=node.cluster, discovered_from=discovered_from)
            log.info(f"  + Node: {node.nombre} ({node.cluster}/{node.categoria})")
            return node_id
    except Exception as e:
        log.error(f"  Failed to insert node {node.nombre}: {e}")
    return None


def insert_edge(source_name: str, target_name: str, rel_type: str) -> bool:
    """Insert an edge between two nodes. Returns True on success."""
    sb = get_supabase()

    # Resolve names to IDs
    source_resp = sb.table("nodes").select("id").eq("nombre", source_name).execute()
    target_resp = sb.table("nodes").select("id").eq("nombre", target_name).execute()

    if not source_resp.data or not target_resp.data:
        return False

    source_id = source_resp.data[0]["id"]
    target_id = target_resp.data[0]["id"]

    # Check if edge exists
    existing = (
        sb.table("edges")
        .select("id")
        .eq("source_id", source_id)
        .eq("target_id", target_id)
        .execute()
    )
    if existing.data:
        return False

    row = {
        "source_id": source_id,
        "target_id": target_id,
        "relationship_type": rel_type,
        "description": f"{source_name} {rel_type} {target_name}",
        "confidence": 0.8,
        "source": "agent",
    }

    try:
        resp = sb.table("edges").insert(row).execute()
        if resp.data:
            log_event("new_edge", source=source_name, target=target_name, type=rel_type)
            log.info(f"  + Edge: {source_name} --{rel_type}--> {target_name}")
            return True
    except Exception as e:
        log.error(f"  Failed to insert edge: {e}")
    return False


async def run_one_cycle() -> dict:
    """Run a single research cycle on one company.

    Returns a summary dict with cycle results.
    """
    summary = {
        "company": None,
        "new_nodes": 0,
        "new_edges": 0,
        "duplicates_skipped": 0,
        "errors": [],
    }

    # Step 1: Pick next company
    company = get_next_company()
    if not company:
        log.info("All companies have been visited. Nothing to do.")
        summary["errors"].append("exhausted")
        return summary

    name = company["nombre"]
    url = company.get("link")
    summary["company"] = name
    log.info(f"Researching: {name} ({url})")

    if not url:
        log.warning(f"No URL for {name}, marking visited and skipping.")
        cmd_mark_visited(name)
        return summary

    # Step 2: Spider the company website
    try:
        existing_names = set(get_all_names())
        result = await spider_company(name, url, existing_names)
    except Exception as e:
        log.error(f"Spider failed for {name}: {e}")
        summary["errors"].append(str(e))
        cmd_mark_visited(name)
        return summary

    log.info(f"  Found {len(result.raw_partners_found)} raw partners, {len(result.discovered_nodes)} classified nodes")

    if result.errors:
        for err in result.errors:
            log.warning(f"  Spider warning: {err}")

    # Step 3: For each discovered node, dedup and insert
    all_known = get_all_names()
    for node in result.discovered_nodes:
        is_dup, match, score = check_duplicate(node.nombre, all_known)
        if is_dup:
            log.info(f"  ~ Duplicate: {node.nombre} matches {match} ({score:.2f})")
            summary["duplicates_skipped"] += 1
            continue

        # Insert node
        node_id = insert_node(node, discovered_from=name)
        if node_id:
            summary["new_nodes"] += 1
            all_known.append(node.nombre)

            # Insert edge
            if insert_edge(name, node.nombre, node.relationship_type):
                summary["new_edges"] += 1

    # Step 4: Mark as visited
    cmd_mark_visited(name)

    # Update state stats
    state = load_state()
    state["stats"]["total_added"] = state["stats"].get("total_added", 0) + summary["new_nodes"]
    state["stats"]["total_edges"] = state["stats"].get("total_edges", 0) + summary["new_edges"]
    save_state(state)

    log.info(
        f"Cycle complete: {name} -> "
        f"{summary['new_nodes']} new nodes, "
        f"{summary['new_edges']} new edges, "
        f"{summary['duplicates_skipped']} duplicates skipped"
    )
    log_event(
        "cycle_complete",
        company=name,
        new_nodes=summary["new_nodes"],
        new_edges=summary["new_edges"],
        duplicates=summary["duplicates_skipped"],
    )

    return summary


async def daemon_loop(interval: int = 600):
    """Main daemon loop. Runs research cycles at the given interval (seconds)."""
    log.info(f"Research daemon started. Interval: {interval}s")
    log.info(f"Supabase: connected")

    cycle_count = 0
    while _running:
        cycle_count += 1
        log.info(f"--- Cycle {cycle_count} ---")

        try:
            summary = await run_one_cycle()

            if "exhausted" in summary.get("errors", []):
                log.info("All companies visited. Waiting for new nodes to be added...")
                # Wait longer when exhausted
                for _ in range(interval * 3):
                    if not _running:
                        break
                    await asyncio.sleep(1)
                continue

        except Exception as e:
            log.error(f"Cycle {cycle_count} failed: {e}")
            log_event("cycle_error", error=str(e))

        # Wait for next cycle (check _running every second for graceful shutdown)
        for _ in range(interval):
            if not _running:
                break
            await asyncio.sleep(1)

    log.info("Research daemon stopped.")


def main():
    parser = argparse.ArgumentParser(description="Green Panorama Research Daemon")
    parser.add_argument("--once", action="store_true", help="Run a single cycle then exit")
    parser.add_argument("--interval", type=int, default=600, help="Seconds between cycles (default: 600)")
    args = parser.parse_args()

    if args.once:
        log.info("Running single research cycle...")
        summary = asyncio.run(run_one_cycle())
        print(json.dumps(summary, indent=2))
    else:
        asyncio.run(daemon_loop(interval=args.interval))


if __name__ == "__main__":
    main()
