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
import os
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
import aiohttp

from agents.research_agent import spider_company

# Vercel-hosted frontend API for GenLayer verification
VERIFY_API_BASE = os.environ.get("VERIFY_API_BASE", "https://green-panorama-ar.vercel.app")

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


async def trigger_verification(node_id: str, nombre: str, link: str, cluster: str, categoria: str, descripcion: str) -> dict:
    """Submit a node to GenLayer for verification via the Vercel API, poll until done, and update Supabase."""
    try:
        async with aiohttp.ClientSession() as session:
            # Step 1: Submit verification
            payload = {
                "nodeId": node_id,
                "nombre": nombre,
                "link": link or "",
                "cluster": cluster or "",
                "categoria": categoria or "",
                "descripcion": descripcion or "",
            }
            async with session.post(f"{VERIFY_API_BASE}/api/verify", json=payload) as resp:
                data = await resp.json()
                if "error" in data:
                    log.warning(f"  Verify submit failed for {nombre}: {data['error']}")
                    return {"status": "submit_failed", "error": data["error"]}
                tx_hash = data.get("txHash")
                if not tx_hash:
                    return {"status": "no_txhash"}

            log.info(f"  Verification submitted for {nombre}: {tx_hash}")

            # Step 2: Poll status (max 60 attempts, 10s apart = ~10 min)
            for attempt in range(60):
                await asyncio.sleep(10)
                async with session.get(f"{VERIFY_API_BASE}/api/verify/status?txHash={tx_hash}") as resp:
                    status_data = await resp.json()
                    status = status_data.get("status", "unknown")

                if status in ("FINALIZED", "ACCEPTED", "accepted", "finalized"):
                    log.info(f"  Verification PASSED for {nombre} (attempt {attempt + 1})")
                    # Update Supabase
                    sb = get_supabase()
                    sb.table("nodes").update({
                        "verified": True,
                        "verification_tx": tx_hash,
                    }).eq("id", node_id).execute()
                    log_event("verification_passed", nombre=nombre, tx_hash=tx_hash, attempts=attempt + 1)
                    return {"status": "verified", "tx_hash": tx_hash}

                if status in ("UNDETERMINED", "CANCELED", "undetermined", "canceled"):
                    log.warning(f"  Verification FAILED for {nombre}: {status}")
                    leader = status_data.get("leaderResult")
                    log_event("verification_failed", nombre=nombre, status=status, leader_result=str(leader)[:200])
                    return {"status": "failed", "reason": status, "leader_result": leader}

                if attempt % 6 == 0:
                    log.info(f"  Still verifying {nombre}... ({status}, attempt {attempt + 1})")

            log.warning(f"  Verification timed out for {nombre}")
            return {"status": "timeout"}

    except Exception as e:
        log.error(f"  Verification error for {nombre}: {e}")
        return {"status": "error", "error": str(e)}


async def verify_unverified_batch(max_nodes: int = 5):
    """Find unverified nodes in Supabase and submit them for GenLayer verification."""
    sb = get_supabase()
    resp = sb.table("nodes").select("id, nombre, link, cluster, categoria, descripcion").eq("verified", False).limit(max_nodes).execute()

    if not resp.data:
        log.info("No unverified nodes found.")
        return []

    log.info(f"Found {len(resp.data)} unverified nodes. Starting verification...")
    results = []
    for node in resp.data:
        result = await trigger_verification(
            node_id=str(node["id"]),
            nombre=node["nombre"],
            link=node.get("link", ""),
            cluster=node.get("cluster", ""),
            categoria=node.get("categoria", ""),
            descripcion=node.get("descripcion", ""),
        )
        results.append({"nombre": node["nombre"], **result})
        # Small gap between submissions to avoid overwhelming GenLayer
        await asyncio.sleep(2)

    verified = sum(1 for r in results if r.get("status") == "verified")
    failed = sum(1 for r in results if r.get("status") == "failed")
    log.info(f"Verification batch done: {verified} verified, {failed} failed, {len(results) - verified - failed} other")
    return results


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

    # Step 4: Auto-verify newly added nodes
    if summary["new_nodes"] > 0:
        log.info(f"  Triggering verification for {summary['new_nodes']} new nodes...")
        verify_results = await verify_unverified_batch(max_nodes=summary["new_nodes"])
        summary["verified"] = sum(1 for r in verify_results if r.get("status") == "verified")
        summary["verification_failed"] = sum(1 for r in verify_results if r.get("status") == "failed")

    # Step 5: Mark as visited
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
                log.info("All companies visited. Running verification pass on unverified nodes...")
                await verify_unverified_batch(max_nodes=5)
                # Wait longer when exhausted
                for _ in range(interval * 3):
                    if not _running:
                        break
                    await asyncio.sleep(1)
                continue

            # Every 3rd cycle, also run a verification pass on old unverified nodes
            if cycle_count % 3 == 0:
                log.info("Periodic verification pass...")
                await verify_unverified_batch(max_nodes=3)

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
