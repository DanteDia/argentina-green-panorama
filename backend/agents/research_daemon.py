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
import random
import signal
import sys
import time
from datetime import datetime, timezone
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

from agents.research_agent import spider_company, research_company
from agents.funding_researcher import research_funding, discover_relationships_deep

# Vercel-hosted frontend API for GenLayer verification
VERIFY_API_BASE = os.environ.get("VERIFY_API_BASE", "https://green-panorama-ar.vercel.app")

# --- Anti-spiral guardrails ---
MAX_DEPTH = 2           # seed=0, direct partner=1, partner-of-partner=2, stop
MAX_AGENT_NODES = 500   # Global budget: max agent-discovered nodes total

# --- Perplexity cost management ---
MAX_FUNDING_QUERIES_PER_CYCLE = 3  # Max Perplexity API calls per research cycle
MAX_DEEP_DISCOVERY_PER_PASS = 3    # Max nodes to deep-research per pass
DEEP_DISCOVERY_EVERY_N_CYCLES = 2  # Run deep discovery every N cycles

# --- Adaptive discovery thresholds ---
NORMAL_THRESHOLD = 1.0    # >1 new node/cycle avg → normal mode
BOOST_THRESHOLD = 0.3     # 0.3-1 new node/cycle avg → boost mode
# <0.3 → saturation mode
METRICS_WINDOW_SHORT = 10   # Recent cycles for mode detection
METRICS_WINDOW_LONG = 20    # Longer window for saturation detection
MAINTENANCE_INTERVAL = 6 * 3600  # 6 hours between maintenance passes

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
    """Get the next company using weighted random selection.

    Weights by depth: seed (depth=0) → weight 10, depth 1 → weight 2.
    Nodes at MAX_DEPTH are excluded (no further spidering).
    This naturally creates breadth-first exploration across seed families.
    """
    sb = get_supabase()
    state = load_state()
    visited = set(state.get("visited", []))

    resp = sb.table("nodes").select("nombre, link, cluster, depth").execute()
    candidates = []
    for node in resp.data:
        if node["nombre"] in visited:
            continue
        depth = node.get("depth") or 0
        if depth >= MAX_DEPTH:
            continue  # Don't spider nodes at max depth
        link = node.get("link", "") or ""
        if not link or "instagram.com" in link:
            continue  # Skip unscrapeable nodes
        candidates.append(node)

    if not candidates:
        return None

    # Weighted random: seeds get 10x weight, depth-1 gets 2x
    weights = []
    for c in candidates:
        d = c.get("depth") or 0
        if d == 0:
            weights.append(10)
        elif d == 1:
            weights.append(2)
        else:
            weights.append(1)

    return random.choices(candidates, weights=weights, k=1)[0]


def get_all_names() -> list[str]:
    """Get all existing node names for dedup."""
    sb = get_supabase()
    resp = sb.table("nodes").select("nombre").execute()
    return [n["nombre"] for n in resp.data]


def insert_node(node, discovered_from: str, depth: int = 1, discovered_by_id: str | None = None) -> str | None:
    """Insert a discovered node into Supabase. Returns node ID or None."""
    sb = get_supabase()

    row = {
        "nombre": node.nombre,
        "link": node.link,
        "cluster": node.cluster or "Startup",
        "categoria": node.categoria or "",
        "descripcion": node.descripcion or "",
        "source": "agent",
        "quien_fondea": getattr(node, "quien_fondea", "") or "",
        "aliados_portfolio": [],
        "clientes": [],
        "depth": depth,
        "discovery_method": getattr(node, "discovery_method", "llm"),
    }
    if discovered_by_id:
        row["discovered_by"] = discovered_by_id

    try:
        resp = sb.table("nodes").insert(row).execute()
        if resp.data:
            node_id = resp.data[0]["id"]
            log_event("new_node", nombre=node.nombre, cluster=node.cluster,
                      discovered_from=discovered_from, depth=depth,
                      discovery_method=row["discovery_method"])
            log.info(f"  + Node: {node.nombre} ({node.cluster}/{node.categoria}) [depth={depth}, method={row['discovery_method']}]")
            return node_id
    except Exception as e:
        log.error(f"  Failed to insert node {node.nombre}: {e}")
    return None


def insert_edge(source_name: str, target_name: str, rel_type: str, discovery_method: str = "llm", confidence: float = 0.8) -> bool:
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
        "confidence": confidence,
        "source": "agent",
        "discovery_method": discovery_method,
    }

    try:
        resp = sb.table("edges").insert(row).execute()
        if resp.data:
            log_event("new_edge", source=source_name, target=target_name, type=rel_type, method=discovery_method)
            log.info(f"  + Edge: {source_name} --{rel_type}--> {target_name} [method={discovery_method}]")
            return True
    except Exception as e:
        log.error(f"  Failed to insert edge: {e}")
    return False


def insert_node_with_edge(node, discovered_from: str, source_name: str, rel_type: str,
                          depth: int = 1, discovered_by_id: str | None = None,
                          discovery_method: str = "llm", confidence: float = 0.8) -> tuple[str | None, bool]:
    """Insert node AND its edge atomically. Deletes node if edge fails. No orphans."""
    node_id = insert_node(node, discovered_from, depth, discovered_by_id)
    if not node_id:
        return None, False

    edge_ok = insert_edge(source_name, node.nombre, rel_type,
                          discovery_method=discovery_method, confidence=confidence)
    if not edge_ok:
        # Rollback: delete the orphan node
        sb = get_supabase()
        sb.table("nodes").delete().eq("id", node_id).execute()
        log.warning(f"  Rolled back orphan node {node.nombre} (edge to {source_name} failed)")
        return None, False

    return node_id, True


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


# Failure types where GenLayer consensus should be trusted — skip straight to grey
CONSENSUS_TRUST_FAILURES = {"green", "sector", "argentina"}


async def re_research_failed_node(node_id: str, nombre: str, link: str, failure_reason: str) -> dict:
    """Re-run research on a node that failed verification.

    Strategy per failure type:
    - "website not found"       → fixable: try to find better URL
    - "description inaccurate"  → fixable: re-scrape and rewrite
    - "not in green sector"     → trust GenLayer consensus, skip to grey
    - "no Argentina connection" → trust GenLayer consensus, skip to grey
    """
    log.info(f"  Re-researching {nombre} due to: {failure_reason}")
    reason_lower = failure_reason.lower()

    # Check if this is a consensus-trust failure — don't fight GenLayer on these
    if any(keyword in reason_lower for keyword in CONSENSUS_TRUST_FAILURES):
        log.info(f"  Skipping retry — GenLayer consensus should be trusted: {failure_reason[:100]}")
        log_event("skip_to_grey", nombre=nombre, reason="consensus_trust", failure=failure_reason[:200])
        return {"status": "skip_to_grey", "reason": failure_reason}

    sb = get_supabase()
    updates = {}

    # Fixable: website not found — try to find a better URL
    if "not found" in reason_lower or "not accessible" in reason_lower:
        log.info(f"  Trying to find better URL for {nombre}...")
        try:
            from agents.research_agent import find_better_url
            new_url = await find_better_url(nombre)
            if new_url and new_url != link:
                updates["link"] = new_url
                log.info(f"  Found new URL: {new_url}")
        except (ImportError, Exception) as e:
            log.warning(f"  Could not find better URL: {e}")

    # Fixable: description inaccurate — re-scrape website and rewrite
    if "description" in reason_lower or "accuracy" in reason_lower:
        log.info(f"  Trying to get better description for {nombre}...")
        try:
            from agents.research_agent import get_company_description
            new_desc = await get_company_description(nombre, link)
            if new_desc:
                updates["descripcion"] = new_desc
                log.info(f"  Updated description for {nombre}")
        except (ImportError, Exception) as e:
            log.warning(f"  Could not get better description: {e}")

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

        # If GenLayer consensus should be trusted (green_sector, argentina_related),
        # skip straight to grey — don't waste time retrying
        if research_result.get("status") == "skip_to_grey":
            sb = get_supabase()
            sb.table("nodes").update({
                "verification_status": "grey",
                "verification_attempts": MAX_VERIFICATION_ATTEMPTS,
                "verification_failure_reason": failure_reason,
            }).eq("id", node_id).execute()
            log.warning(f"  {nombre} → GREY (GenLayer consensus trusted: {failure_reason[:80]})")
            return {"status": "failed", "grey": True, "failure_reason": failure_reason}

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


def get_agent_node_count() -> int:
    """Get current count of agent-discovered nodes (for budget check)."""
    sb = get_supabase()
    resp = sb.table("nodes").select("id", count="exact").eq("source", "agent").execute()
    return resp.count or 0


def get_source_node_id(name: str) -> str | None:
    """Get the UUID of a node by name."""
    sb = get_supabase()
    resp = sb.table("nodes").select("id").eq("nombre", name).execute()
    return resp.data[0]["id"] if resp.data else None


async def run_deep_discovery_pass(max_nodes: int = MAX_DEEP_DISCOVERY_PER_PASS) -> dict:
    """Deep relationship discovery using Perplexity on already-visited nodes.

    Searches newsletters, press releases, social media, event reports for
    relationships that official website scraping missed. Creates new edges
    and potentially new nodes from these discoveries.
    """
    sb = get_supabase()
    state = load_state()
    visited = set(state.get("visited", []))
    deep_searched = set(state.get("deep_searched", []))

    # Pick visited nodes that haven't been deep-searched yet
    # Prioritize seed nodes (depth=0) first
    resp = sb.table("nodes").select("id, nombre, link, cluster, depth").execute()
    candidates = [
        n for n in resp.data
        if n["nombre"] in visited
        and n["nombre"] not in deep_searched
        and n.get("link")
        and "instagram.com" not in (n["link"] or "")
    ]
    # Sort: seeds first, then depth-1
    candidates.sort(key=lambda n: n.get("depth") or 0)

    if not candidates:
        log.info("Deep discovery: all visited nodes already deep-searched")
        return {"deep_searched": 0, "new_edges": 0, "new_nodes": 0}

    results = {"deep_searched": 0, "new_edges": 0, "new_nodes": 0}
    all_known = get_all_names()
    all_known_set = {n.lower() for n in all_known}
    agent_count = get_agent_node_count()
    budget_remaining = MAX_AGENT_NODES - agent_count

    for node in candidates[:max_nodes]:
        nombre = node["nombre"]
        url = node.get("link")
        log.info(f"  Deep discovery: {nombre} (depth={node.get('depth', 0)})")

        relationships = discover_relationships_deep(nombre, url)
        results["deep_searched"] += 1

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

            # Check if partner already exists as a node
            if partner_name.lower() in all_known_set:
                # Just create the edge if it doesn't exist
                if insert_edge(nombre, partner_name, rel_type,
                              discovery_method="perplexity_deep", confidence=0.7):
                    results["new_edges"] += 1
                    log.info(f"    + Edge: {nombre} --{rel_type}--> {partner_name} [evidence: {evidence[:60]}]")
                continue

            # New company — check budget and research it
            if budget_remaining <= 0:
                continue

            # Check fuzzy dedup
            is_dup, match, score = check_duplicate(partner_name, all_known)
            if is_dup:
                # Create edge to the matched existing node instead
                if insert_edge(nombre, match, rel_type,
                              discovery_method="perplexity_deep", confidence=0.7):
                    results["new_edges"] += 1
                continue

            # Research and classify the new company
            classified = research_company(partner_name, partner_url)
            if classified:
                node_id, edge_ok = insert_node_with_edge(
                    classified, discovered_from=nombre, source_name=nombre,
                    rel_type=rel_type,
                    depth=min((node.get("depth") or 0) + 1, MAX_DEPTH),
                    discovery_method="perplexity_deep", confidence=0.7,
                )
                if node_id:
                    results["new_nodes"] += 1
                    budget_remaining -= 1
                    all_known.append(partner_name)
                    all_known_set.add(partner_name.lower())
                    if edge_ok:
                        results["new_edges"] += 1
                    log.info(f"    + New node from deep discovery: {partner_name} [evidence: {evidence[:60]}]")

        # Mark as deep-searched
        state.setdefault("deep_searched", []).append(nombre)
        save_state(state)

    log.info(f"  Deep discovery pass: {results['deep_searched']} nodes searched, "
             f"{results['new_nodes']} new nodes, {results['new_edges']} new edges")
    log_event("deep_discovery_pass", **results)
    return results


async def fix_orphan_nodes():
    """Find and fix orphan nodes (0 connections). No orphans ever.

    For each orphan:
    1. Try Perplexity to find at least 1 relationship
    2. If found → create edge (to existing node or skip)
    3. If NOT found → delete the orphan node
    """
    sb = get_supabase()
    nodes_resp = sb.table("nodes").select("id, nombre, link, source").execute()
    edges_resp = sb.table("edges").select("source_id, target_id").execute()

    # Find connected node IDs
    connected_ids = set()
    for e in edges_resp.data:
        connected_ids.add(e["source_id"])
        connected_ids.add(e["target_id"])

    # Find orphans
    orphans = [n for n in nodes_resp.data if n["id"] not in connected_ids]

    if not orphans:
        log.info("  No orphan nodes found")
        return

    log.info(f"  Found {len(orphans)} orphan nodes, attempting to fix...")

    all_names = [n["nombre"] for n in nodes_resp.data]
    all_names_lower = {n.lower() for n in all_names}
    fixed = 0
    deleted = 0

    for orphan in orphans:
        nombre = orphan["nombre"]
        url = orphan.get("link")

        # Try Perplexity to find at least 1 connection
        relationships = discover_relationships_deep(nombre, url)

        edge_created = False
        for rel in (relationships or []):
            partner_name = rel.get("name", "").strip()
            if not partner_name:
                continue

            relationship = rel.get("relationship", "partner")
            rel_type = "partners_with"
            if relationship in ("funder", "investor", "co_investor", "backed_by"):
                rel_type = "funds"
            elif relationship in ("client", "customer"):
                rel_type = "client_of"

            # Only connect to existing nodes (don't create more potential orphans)
            if partner_name.lower() in all_names_lower:
                exact_name = next((n for n in all_names if n.lower() == partner_name.lower()), partner_name)
                if insert_edge(nombre, exact_name, rel_type,
                              discovery_method="perplexity_deep", confidence=0.7):
                    log.info(f"    Fixed orphan: {nombre} --{rel_type}--> {exact_name}")
                    edge_created = True
                    break  # One connection is enough

            # Try fuzzy match
            is_dup, match, score = check_duplicate(partner_name, all_names)
            if is_dup:
                if insert_edge(nombre, match, rel_type,
                              discovery_method="perplexity_deep", confidence=0.7):
                    log.info(f"    Fixed orphan: {nombre} --{rel_type}--> {match} (fuzzy)")
                    edge_created = True
                    break

        if edge_created:
            fixed += 1
        else:
            # No connection found — delete the orphan
            sb.table("nodes").delete().eq("id", orphan["id"]).execute()
            log.info(f"    Deleted orphan: {nombre} (no connections found)")
            deleted += 1

    log.info(f"  Orphan cleanup: {fixed} fixed, {deleted} deleted")
    log_event("orphan_cleanup", fixed=fixed, deleted=deleted, total_orphans=len(orphans))


async def run_one_cycle() -> dict:
    """Run a single research cycle on one company.

    Returns a summary dict with cycle results.
    """
    summary = {
        "company": None,
        "new_nodes": 0,
        "new_edges": 0,
        "duplicates_skipped": 0,
        "depth_rejected": 0,
        "llm_at_depth_rejected": 0,
        "errors": [],
    }

    # Budget check: stop adding nodes if we hit the global cap
    agent_count = get_agent_node_count()
    if agent_count >= MAX_AGENT_NODES:
        log.info(f"Budget exhausted: {agent_count}/{MAX_AGENT_NODES} agent nodes. Skipping research.")
        summary["errors"].append("budget_exhausted")
        return summary

    # Step 1: Pick next company (weighted random)
    company = get_next_company()
    if not company:
        log.info("All companies have been visited. Nothing to do.")
        summary["errors"].append("exhausted")
        return summary

    name = company["nombre"]
    url = company.get("link")
    source_depth = company.get("depth") or 0
    summary["company"] = name
    log.info(f"Researching: {name} ({url}) [depth={source_depth}]")

    if not url:
        log.warning(f"No URL for {name}, marking visited and skipping.")
        cmd_mark_visited(name)
        return summary

    # Step 2: Spider the company website (pass depth for LLM gating)
    try:
        existing_names = set(get_all_names())
        result = await spider_company(name, url, existing_names, source_depth=source_depth)
    except Exception as e:
        log.error(f"Spider failed for {name}: {e}")
        summary["errors"].append(str(e))
        cmd_mark_visited(name)
        return summary

    log.info(f"  Found {len(result.raw_partners_found)} raw partners, {len(result.discovered_nodes)} classified nodes")

    if result.errors:
        for err in result.errors:
            log.warning(f"  Spider warning: {err}")

    # Step 3: For each discovered node, apply guardrails, dedup, and insert
    child_depth = source_depth + 1
    source_node_id = get_source_node_id(name)
    all_known = get_all_names()
    budget_remaining = MAX_AGENT_NODES - agent_count
    newly_inserted_pairs = []  # Track (node, node_id) for funding research

    for node in result.discovered_nodes:
        # Guardrail: budget check
        if budget_remaining <= 0:
            log.info(f"  Budget cap reached during cycle. Stopping insertions.")
            break

        # Guardrail: reject LLM-only discoveries from depth-1+ sources
        if source_depth >= 1 and getattr(node, "discovery_method", "llm") == "llm":
            log.info(f"  ~ LLM-at-depth rejected: {node.nombre} (source depth={source_depth}, method=llm)")
            summary["llm_at_depth_rejected"] += 1
            continue

        is_dup, match, score = check_duplicate(node.nombre, all_known)
        if is_dup:
            log.info(f"  ~ Duplicate: {node.nombre} matches {match} ({score:.2f})")
            summary["duplicates_skipped"] += 1
            continue

        # Insert node + edge atomically (rollback node if edge fails)
        node_id, edge_ok = insert_node_with_edge(
            node, discovered_from=name, source_name=name,
            rel_type=node.relationship_type,
            depth=child_depth, discovered_by_id=source_node_id,
            discovery_method=getattr(node, "discovery_method", "llm"),
            confidence=getattr(node, "confidence", 0.8),
        )
        if node_id:
            summary["new_nodes"] += 1
            budget_remaining -= 1
            all_known.append(node.nombre)
            newly_inserted_pairs.append((node, node_id))
            if edge_ok:
                summary["new_edges"] += 1

    # Step 3b: Funding research via Perplexity for newly inserted nodes
    # Only for depth-0 and depth-1 discoveries (not depth-2)
    funding_budget = MAX_FUNDING_QUERIES_PER_CYCLE
    if child_depth <= 1 and newly_inserted_pairs:
        sb = get_supabase()
        for node, node_id in newly_inserted_pairs[:funding_budget]:
            funding = research_funding(node.nombre, node.link)
            if funding.funders and not funding.error:
                sb.table("nodes").update({
                    "quien_fondea": funding.quien_fondea_str
                }).eq("id", node_id).execute()
                log.info(f"  $ Funding: {node.nombre} <- {funding.quien_fondea_str}")

                # Create 'funds' edges for discovered funders
                for funder in funding.funders:
                    if funder.funder_name:
                        insert_edge(funder.funder_name, node.nombre, "funds",
                                    discovery_method="perplexity", confidence=0.7)

                summary["funding_researched"] = summary.get("funding_researched", 0) + 1
                log_event("funding_research", company=node.nombre,
                          funders=funding.quien_fondea_str, model=funding.model_used)
            elif funding.error:
                log.warning(f"  $ Funding research failed for {node.nombre}: {funding.error}")

    # Step 3c: Update source company's quien_fondea with discovered funders
    funder_names = [
        node.nombre for node in result.discovered_nodes
        if node.relationship_type == "funds"
    ]
    if funder_names:
        sb = get_supabase()
        current = sb.table("nodes").select("quien_fondea").eq("nombre", name).execute()
        existing_funders = current.data[0].get("quien_fondea", "") if current.data else ""
        existing_set = {f.strip() for f in existing_funders.split(",") if f.strip()} if existing_funders else set()
        new_funders = existing_set | set(funder_names)
        sb.table("nodes").update({"quien_fondea": ", ".join(sorted(new_funders))}).eq("nombre", name).execute()
        log.info(f"  $ Updated quien_fondea for {name}: {', '.join(sorted(new_funders))}")

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
        f"Cycle complete: {name} [depth={source_depth}] -> "
        f"{summary['new_nodes']} new, "
        f"{summary['new_edges']} edges, "
        f"{summary['duplicates_skipped']} dups, "
        f"{summary['llm_at_depth_rejected']} llm-rejected"
    )
    log_event(
        "cycle_complete",
        company=name,
        source_depth=source_depth,
        child_depth=child_depth,
        new_nodes=summary["new_nodes"],
        new_edges=summary["new_edges"],
        duplicates=summary["duplicates_skipped"],
        llm_rejected=summary["llm_at_depth_rejected"],
        budget_remaining=budget_remaining,
    )

    return summary


def record_cycle_metrics(state: dict, cycle_count: int, summary: dict):
    """Record discovery metrics for this cycle into state."""
    entry = {
        "cycle": cycle_count,
        "ts": datetime.now(timezone.utc).isoformat(),
        "new_nodes": summary.get("new_nodes", 0),
        "new_edges": summary.get("new_edges", 0),
        "duplicates": summary.get("duplicates_skipped", 0),
    }
    state.setdefault("discovery_rate", []).append(entry)
    # Keep last 100 entries
    state["discovery_rate"] = state["discovery_rate"][-100:]
    save_state(state)

    # Log rolling averages
    rates = state["discovery_rate"]
    recent_5 = rates[-5:] if len(rates) >= 5 else rates
    recent_20 = rates[-20:] if len(rates) >= 20 else rates

    avg_nodes_5 = sum(r["new_nodes"] for r in recent_5) / len(recent_5) if recent_5 else 0
    avg_nodes_20 = sum(r["new_nodes"] for r in recent_20) / len(recent_20) if recent_20 else 0
    avg_edges_5 = sum(r["new_edges"] for r in recent_5) / len(recent_5) if recent_5 else 0

    mode = get_discovery_mode(state)
    log.info(f"  Discovery rate: {avg_nodes_5:.1f} nodes/cycle (last 5), "
             f"{avg_nodes_20:.1f} (last 20), mode={mode}")

    log_event("discovery_rate",
              avg_nodes_5=round(avg_nodes_5, 2),
              avg_nodes_20=round(avg_nodes_20, 2),
              avg_edges_5=round(avg_edges_5, 2),
              mode=mode,
              cycle=cycle_count)

    if avg_nodes_5 < BOOST_THRESHOLD and len(rates) >= METRICS_WINDOW_SHORT:
        log.warning(f"  Discovery rate very low ({avg_nodes_5:.1f}/cycle) — approaching saturation")

    return mode


def get_discovery_mode(state: dict) -> str:
    """Determine current discovery mode based on recent metrics.

    Returns: "normal", "boost", or "saturation"
    """
    rates = state.get("discovery_rate", [])

    # Not enough data yet — default to normal
    if len(rates) < METRICS_WINDOW_SHORT:
        return "normal"

    recent = rates[-METRICS_WINDOW_SHORT:]
    avg_nodes = sum(r["new_nodes"] for r in recent) / len(recent)

    if avg_nodes > NORMAL_THRESHOLD:
        return "normal"

    if avg_nodes > BOOST_THRESHOLD:
        return "boost"

    # Check longer window for saturation confirmation
    if len(rates) >= METRICS_WINDOW_LONG:
        long_recent = rates[-METRICS_WINDOW_LONG:]
        avg_long = sum(r["new_nodes"] for r in long_recent) / len(long_recent)
        if avg_long < BOOST_THRESHOLD:
            return "saturation"

    return "boost"


async def run_re_research_pass(max_nodes: int = 3) -> dict:
    """Re-research already deep-searched nodes looking for NEW relationships.

    Targets temporal changes: new press releases, new partnerships announced,
    new LinkedIn posts since last search. Only creates edges to existing nodes
    (no new node creation in re-research).
    """
    sb = get_supabase()
    state = load_state()
    deep_searched = list(state.get("deep_searched", []))
    re_researched = state.get("re_researched", {})  # {name: last_ts}

    if not deep_searched:
        return {"re_researched": 0, "new_edges": 0}

    # Pick random nodes, preferring those not recently re-researched
    now = datetime.now(timezone.utc).isoformat()
    candidates = sorted(deep_searched, key=lambda n: re_researched.get(n, ""))
    selected = candidates[:max_nodes]

    results = {"re_researched": 0, "new_edges": 0}
    all_known = get_all_names()
    all_known_set = {n.lower() for n in all_known}

    # Get node URLs
    resp = sb.table("nodes").select("nombre, link").execute()
    name_to_url = {n["nombre"]: n.get("link") for n in resp.data}

    for nombre in selected:
        url = name_to_url.get(nombre)
        log.info(f"  Re-research: {nombre}")

        relationships = discover_relationships_deep(nombre, url)
        results["re_researched"] += 1

        for rel in (relationships or []):
            partner_name = rel.get("name", "").strip()
            if not partner_name:
                continue

            relationship = rel.get("relationship", "partner")
            evidence = rel.get("evidence", "")

            rel_type = "partners_with"
            if relationship in ("funder", "investor", "co_investor", "backed_by"):
                rel_type = "funds"
            elif relationship in ("client", "customer"):
                rel_type = "client_of"
            elif relationship in ("portfolio", "portfolio_company"):
                rel_type = "portfolio"

            # Only connect to existing nodes
            if partner_name.lower() in all_known_set:
                exact_name = next((n for n in all_known if n.lower() == partner_name.lower()), partner_name)
                if insert_edge(nombre, exact_name, rel_type,
                              discovery_method="perplexity_deep", confidence=0.7):
                    results["new_edges"] += 1
                    log.info(f"    + Re-research edge: {nombre} --{rel_type}--> {exact_name} [{evidence[:50]}]")
            else:
                # Try fuzzy match
                is_dup, match, score = check_duplicate(partner_name, all_known)
                if is_dup:
                    if insert_edge(nombre, match, rel_type,
                                  discovery_method="perplexity_deep", confidence=0.7):
                        results["new_edges"] += 1

        # Track re-research timestamp
        state.setdefault("re_researched", {})[nombre] = now
        save_state(state)

    log.info(f"  Re-research pass: {results['re_researched']} nodes, {results['new_edges']} new edges")
    log_event("re_research_pass", **results)
    return results


async def run_maintenance_pass(state: dict):
    """Maintenance mode: relationship refresh + ecosystem health metrics.

    Runs when ecosystem is saturated (no new nodes being discovered).
    Focus: find new edges between existing nodes, log ecosystem health.
    """
    sb = get_supabase()
    log.info("=== MAINTENANCE MODE PASS ===")

    # 1. Relationship refresh: pick 5 random nodes, find new edges
    resp = sb.table("nodes").select("nombre, link").execute()
    all_nodes = resp.data
    all_names = [n["nombre"] for n in all_nodes]
    all_names_set = {n.lower() for n in all_names}

    sample = random.sample(all_nodes, min(5, len(all_nodes)))
    new_edges = 0
    for node in sample:
        nombre = node["nombre"]
        url = node.get("link")
        log.info(f"  Maintenance refresh: {nombre}")

        relationships = discover_relationships_deep(nombre, url)
        for rel in (relationships or []):
            partner_name = rel.get("name", "").strip()
            if not partner_name:
                continue

            relationship = rel.get("relationship", "partner")
            rel_type = "partners_with"
            if relationship in ("funder", "investor", "co_investor", "backed_by"):
                rel_type = "funds"
            elif relationship in ("client", "customer"):
                rel_type = "client_of"
            elif relationship in ("portfolio", "portfolio_company"):
                rel_type = "portfolio"

            if partner_name.lower() in all_names_set:
                exact_name = next((n for n in all_names if n.lower() == partner_name.lower()), partner_name)
                if insert_edge(nombre, exact_name, rel_type,
                              discovery_method="perplexity_deep", confidence=0.7):
                    new_edges += 1
                    log.info(f"    + Maintenance edge: {nombre} --{rel_type}--> {exact_name}")
            else:
                is_dup, match, score = check_duplicate(partner_name, all_names)
                if is_dup:
                    if insert_edge(nombre, match, rel_type,
                                  discovery_method="perplexity_deep", confidence=0.7):
                        new_edges += 1

    # 2. Ecosystem health stats
    nodes_resp = sb.table("nodes").select("id, source, verified, cluster", count="exact").execute()
    edges_resp = sb.table("edges").select("id", count="exact").execute()
    total_nodes = nodes_resp.count or len(nodes_resp.data)
    total_edges = edges_resp.count or len(edges_resp.data)
    verified = sum(1 for n in nodes_resp.data if n.get("verified"))
    agent_nodes = sum(1 for n in nodes_resp.data if n.get("source") == "agent")

    # Check for orphans
    edges_full = sb.table("edges").select("source_id, target_id").execute()
    connected = set()
    for e in edges_full.data:
        connected.add(e["source_id"])
        connected.add(e["target_id"])
    orphans = sum(1 for n in nodes_resp.data if n["id"] not in connected)

    log.info(f"  Ecosystem health: {total_nodes} nodes, {total_edges} edges, "
             f"{verified} verified, {agent_nodes} agent, {orphans} orphans, "
             f"{new_edges} new edges this pass")

    log_event("maintenance_pass",
              total_nodes=total_nodes,
              total_edges=total_edges,
              verified=verified,
              agent_nodes=agent_nodes,
              orphans=orphans,
              new_edges=new_edges)

    # Fix any orphans found
    if orphans > 0:
        await fix_orphan_nodes()


async def daemon_loop(interval: int = 600):
    """Main daemon loop with adaptive discovery modes.

    Modes:
    - normal: standard research cycles, discovery rate > 1 node/cycle
    - boost: aggressive deep discovery, rate 0.3-1 node/cycle
    - saturation: maintenance only, rate < 0.3 node/cycle over 20 cycles
    """
    log.info(f"Research daemon started. Interval: {interval}s")
    log.info(f"Supabase: connected")

    cycle_count = 0
    while _running:
        cycle_count += 1
        state = load_state()
        mode = get_discovery_mode(state)
        log.info(f"--- Cycle {cycle_count} [mode={mode}] ---")

        try:
            # SATURATION MODE: maintenance only, long sleep
            if mode == "saturation":
                log.info("Saturation mode — running maintenance pass (next in 6h)")
                await run_maintenance_pass(state)
                for _ in range(MAINTENANCE_INTERVAL):
                    if not _running:
                        break
                    await asyncio.sleep(1)
                # Still record a metrics entry so we can detect recovery
                record_cycle_metrics(state, cycle_count, {"new_nodes": 0, "new_edges": 0})
                continue

            # NORMAL + BOOST: run main research cycle
            summary = await run_one_cycle()

            # Record metrics and get updated mode
            state = load_state()
            mode = record_cycle_metrics(state, cycle_count, summary)

            if "budget_exhausted" in summary.get("errors", []):
                log.info("Node budget exhausted. Running verification + deep discovery...")
                await verify_unverified_batch(max_nodes=5)
                await run_deep_discovery_pass(max_nodes=MAX_DEEP_DISCOVERY_PER_PASS)
                for _ in range(interval * 3):
                    if not _running:
                        break
                    await asyncio.sleep(1)
                continue

            if "exhausted" in summary.get("errors", []):
                log.info("All companies visited. Running verification + deep discovery + re-research...")
                await verify_unverified_batch(max_nodes=5)
                await run_deep_discovery_pass(max_nodes=MAX_DEEP_DISCOVERY_PER_PASS)
                await run_re_research_pass(max_nodes=3)
                for _ in range(interval * 3):
                    if not _running:
                        break
                    await asyncio.sleep(1)
                continue

            # BOOST MODE: more aggressive discovery
            if mode == "boost":
                log.info("Boost mode — running extra deep discovery + re-research...")
                # Double the deep discovery per pass
                await run_deep_discovery_pass(max_nodes=MAX_DEEP_DISCOVERY_PER_PASS * 2)
                # Also re-research previously searched nodes
                await run_re_research_pass(max_nodes=3)

            # NORMAL MODE periodic passes
            # Every 3rd cycle, also run a verification pass on old unverified nodes
            if cycle_count % 3 == 0:
                log.info("Periodic verification pass...")
                await verify_unverified_batch(max_nodes=3)

            # Deep discovery: every cycle in boost, every Nth in normal
            deep_every_n = 1 if mode == "boost" else DEEP_DISCOVERY_EVERY_N_CYCLES
            if cycle_count % deep_every_n == 0 and mode != "boost":  # boost already ran it above
                log.info("Deep relationship discovery pass (newsletters, social media, press)...")
                await run_deep_discovery_pass(max_nodes=MAX_DEEP_DISCOVERY_PER_PASS)

            # Every 5th cycle, sweep for orphan nodes (0 connections)
            if cycle_count % 5 == 0:
                log.info("Orphan node cleanup...")
                await fix_orphan_nodes()

            # Log ecosystem health every 10 cycles
            if cycle_count % 10 == 0:
                sb = get_supabase()
                n_count = sb.table("nodes").select("id", count="exact").execute()
                e_count = sb.table("edges").select("id", count="exact").execute()
                agent_count = get_agent_node_count()
                log_event("ecosystem_health",
                          total_nodes=n_count.count or 0,
                          total_edges=e_count.count or 0,
                          agent_nodes=agent_count,
                          budget_remaining=MAX_AGENT_NODES - agent_count,
                          mode=mode,
                          cycle=cycle_count)

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
