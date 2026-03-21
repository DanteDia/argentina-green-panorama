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


MAX_VERIFICATION_ATTEMPTS = 3


async def trigger_verification(node_id: str, nombre: str, link: str, cluster: str, categoria: str, descripcion: str) -> dict:
    """Submit a node to GenLayer for verification via the Vercel API, poll until done, and update Supabase."""
    sb = get_supabase()

    # Mark as pending in Supabase
    sb.table("nodes").update({"verification_status": "pending"}).eq("id", node_id).execute()

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
                    sb.table("nodes").update({
                        "verified": True,
                        "verification_tx": tx_hash,
                        "verification_status": "verified",
                        "verification_failure_reason": None,
                    }).eq("id", node_id).execute()
                    log_event("verification_passed", nombre=nombre, tx_hash=tx_hash, attempts=attempt + 1)
                    return {"status": "verified", "tx_hash": tx_hash}

                if status in ("UNDETERMINED", "CANCELED", "undetermined", "canceled"):
                    leader = status_data.get("leaderResult")
                    failure_reason = extract_failure_reason(leader)
                    log.warning(f"  Verification FAILED for {nombre}: {status} — {failure_reason}")

                    # Increment attempts and store failure reason
                    current = sb.table("nodes").select("verification_attempts").eq("id", node_id).execute()
                    attempts = (current.data[0]["verification_attempts"] or 0) + 1 if current.data else 1

                    new_status = "grey" if attempts >= MAX_VERIFICATION_ATTEMPTS else "failed"
                    sb.table("nodes").update({
                        "verification_attempts": attempts,
                        "verification_status": new_status,
                        "verification_failure_reason": failure_reason,
                    }).eq("id", node_id).execute()

                    log_event("verification_failed", nombre=nombre, status=status,
                              attempts=attempts, failure_reason=failure_reason,
                              leader_result=str(leader)[:300])

                    if new_status == "grey":
                        log.warning(f"  {nombre} hit {MAX_VERIFICATION_ATTEMPTS} failures — marked GREY (manual review needed)")

                    return {"status": "failed", "reason": status, "failure_reason": failure_reason,
                            "leader_result": leader, "attempts": attempts, "grey": new_status == "grey"}

                if attempt % 6 == 0:
                    log.info(f"  Still verifying {nombre}... ({status}, attempt {attempt + 1})")

            log.warning(f"  Verification timed out for {nombre}")
            return {"status": "timeout"}

    except Exception as e:
        log.error(f"  Verification error for {nombre}: {e}")
        return {"status": "error", "error": str(e)}


def extract_failure_reason(leader_result) -> str:
    """Extract human-readable failure reason from GenLayer leader result."""
    if not leader_result:
        return "No feedback from validators"

    if isinstance(leader_result, str):
        try:
            leader_result = json.loads(leader_result)
        except (json.JSONDecodeError, TypeError):
            return f"Validator feedback: {str(leader_result)[:200]}"

    if isinstance(leader_result, dict):
        # Extract specific failure fields from the contract response
        reasons = []
        if leader_result.get("exists") is False:
            reasons.append("Company website not found or not accessible")
        if leader_result.get("argentina_related") is False:
            reasons.append("No evidence of Argentina connection")
        if leader_result.get("green_sector") is False:
            reasons.append("Not clearly in the green/environmental sector")
        if leader_result.get("description_accurate") is False:
            reasons.append("Description does not match website content")
        if leader_result.get("reasoning"):
            reasons.append(f"Reasoning: {str(leader_result['reasoning'])[:200]}")
        if leader_result.get("accuracy_score") == "low":
            reasons.append("Overall accuracy score: low")

        return " | ".join(reasons) if reasons else f"Validator output: {json.dumps(leader_result)[:200]}"

    return f"Unexpected result format: {str(leader_result)[:200]}"


async def re_research_failed_node(node_id: str, nombre: str, link: str, failure_reason: str) -> dict:
    """Re-run research on a node that failed verification, trying to fix the data."""
    log.info(f"  Re-researching {nombre} due to: {failure_reason}")

    sb = get_supabase()
    updates = {}

    # If website not found, try to find a better URL
    if "not found" in failure_reason.lower() or "not accessible" in failure_reason.lower():
        log.info(f"  Trying to find better URL for {nombre}...")
        try:
            from agents.research_agent import find_better_url
            new_url = await find_better_url(nombre)
            if new_url and new_url != link:
                updates["link"] = new_url
                log.info(f"  Found new URL: {new_url}")
        except (ImportError, Exception) as e:
            log.warning(f"  Could not find better URL: {e}")

    # If description inaccurate, try to get better description
    if "description" in failure_reason.lower():
        log.info(f"  Trying to get better description for {nombre}...")
        try:
            from agents.research_agent import get_company_description
            new_desc = await get_company_description(nombre, link)
            if new_desc:
                updates["descripcion"] = new_desc
                log.info(f"  Updated description for {nombre}")
        except (ImportError, Exception) as e:
            log.warning(f"  Could not get better description: {e}")

    # If not clearly in green sector, try to find green sector evidence
    if "green" in failure_reason.lower() or "sector" in failure_reason.lower():
        log.info(f"  Trying to find green sector evidence for {nombre}...")
        try:
            from agents.research_agent import check_green_sector
            is_green, evidence = await check_green_sector(nombre, link)
            if is_green and evidence:
                current = sb.table("nodes").select("descripcion").eq("id", node_id).execute()
                if current.data:
                    old_desc = current.data[0].get("descripcion", "")
                    updates["descripcion"] = f"{old_desc}. Sector verde: {evidence}"
        except (ImportError, Exception) as e:
            log.warning(f"  Could not check green sector: {e}")

    if updates:
        sb.table("nodes").update(updates).eq("id", node_id).execute()
        log_event("re_research_updated", nombre=nombre, updates=list(updates.keys()))
        log.info(f"  Updated {len(updates)} fields for {nombre}: {list(updates.keys())}")
        return {"status": "updated", "fields": list(updates.keys())}
    else:
        log.info(f"  No improvements found for {nombre}")
        return {"status": "no_changes"}


async def verify_with_retry(node_id: str, nombre: str, link: str, cluster: str,
                             categoria: str, descripcion: str) -> dict:
    """Full verification flow with retry logic:
    1. Try verification
    2. On failure, extract feedback from GenLayer
    3. Re-research to fix data
    4. Retry verification
    5. After 3 failures, mark as grey (manual review)
    """
    result = await trigger_verification(node_id, nombre, link, cluster, categoria, descripcion)

    if result.get("status") == "verified":
        return result

    if result.get("grey"):
        return result  # Already hit max attempts

    # Verification failed — try to fix and retry
    failure_reason = result.get("failure_reason", "Unknown")
    attempts = result.get("attempts", 1)

    if attempts < MAX_VERIFICATION_ATTEMPTS:
        # Step 1: Re-research based on failure feedback
        research_result = await re_research_failed_node(node_id, nombre, link, failure_reason)

        if research_result.get("status") == "updated":
            # Reload updated node data from Supabase
            sb = get_supabase()
            updated = sb.table("nodes").select("link, descripcion").eq("id", node_id).execute()
            if updated.data:
                new_link = updated.data[0].get("link", link)
                new_desc = updated.data[0].get("descripcion", descripcion)
                log.info(f"  Retrying verification for {nombre} with updated data...")
                await asyncio.sleep(5)  # Brief pause before retry
                return await trigger_verification(node_id, nombre, new_link, cluster, categoria, new_desc)

    return result


async def verify_unverified_batch(max_nodes: int = 5):
    """Find unverified nodes and submit for GenLayer verification with retry logic."""
    sb = get_supabase()

    # Get nodes that are unverified or failed (but NOT grey — those need manual review)
    resp = (
        sb.table("nodes")
        .select("id, nombre, link, cluster, categoria, descripcion, verification_attempts, verification_status")
        .neq("verification_status", "grey")
        .neq("verification_status", "verified")
        .neq("verification_status", "pending")
        .order("verification_attempts", desc=False)  # Try nodes with fewest attempts first
        .limit(max_nodes)
        .execute()
    )

    if not resp.data:
        log.info("No nodes needing verification found.")
        return []

    log.info(f"Found {len(resp.data)} nodes to verify (attempts: {[n.get('verification_attempts', 0) for n in resp.data]})")
    results = []
    for node in resp.data:
        result = await verify_with_retry(
            node_id=str(node["id"]),
            nombre=node["nombre"],
            link=node.get("link", ""),
            cluster=node.get("cluster", ""),
            categoria=node.get("categoria", ""),
            descripcion=node.get("descripcion", ""),
        )
        results.append({"nombre": node["nombre"], **result})
        await asyncio.sleep(2)

    verified = sum(1 for r in results if r.get("status") == "verified")
    failed = sum(1 for r in results if r.get("status") == "failed")
    grey = sum(1 for r in results if r.get("grey"))
    log.info(f"Verification batch done: {verified} verified, {failed} failed, {grey} grey")
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
