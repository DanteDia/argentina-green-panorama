"""
Green Panorama Event Intelligence Daemon

24/7 daemon that deeply researches companies attending BlockchainRio 2026
(and future events). Reads event_participants, queries Perplexity Sonar for
recent news/signals, and stores intelligence in the node_intelligence table.

Run:
  python -m agents.event_daemon                        # Run continuously (every 15 min)
  python -m agents.event_daemon --once                 # Single cycle then exit
  python -m agents.event_daemon --interval 600         # Every 10 minutes
  python -m agents.event_daemon --event-slug myevent   # Different event
"""

import argparse
import asyncio
import json
import logging
import os
import re
import signal
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Add parent to path so we can import agents modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
from openai import OpenAI
from supabase import create_client

load_dotenv(Path(__file__).parent.parent / ".env")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

DEFAULT_EVENT_SLUG = "blockchainrio-2026"
COMPANIES_PER_CYCLE = 5
STATE_FILE = Path(os.getenv("STATE_DIR", Path(__file__).parent.parent / "data")) / "event_daemon_state.json"

INTEL_TYPES = [
    "grant",
    "partnership",
    "hiring",
    "product_launch",
    "funding_round",
    "regulatory",
    "social_signal",
]

SONAR_MODEL = "perplexity/sonar"
EXTRACT_MODEL = "google/gemini-3.1-flash-lite-preview"  # Free model for signal extraction

# Relationship discovery budgets per cycle
MAX_PERPLEXITY_PER_CYCLE = 3   # Deep discovery calls (~$0.03/cycle)
MAX_SIGNAL_EXTRACTIONS_PER_CYCLE = 10  # Free Gemini calls

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("event_daemon")

# ---------------------------------------------------------------------------
# Graceful shutdown
# ---------------------------------------------------------------------------

_running = True


def _handle_signal(signum, frame):
    global _running
    log.info(f"Received signal {signum}, shutting down gracefully...")
    _running = False


signal.signal(signal.SIGTERM, _handle_signal)
signal.signal(signal.SIGINT, _handle_signal)

# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------


def get_supabase():
    if not SUPABASE_URL or not SUPABASE_KEY:
        log.error("SUPABASE_URL and SUPABASE_KEY must be set in backend/.env")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def get_openrouter():
    api_key = os.getenv("OPENROUTER_API_KEY", "")
    if not api_key:
        log.error("OPENROUTER_API_KEY must be set in backend/.env")
        sys.exit(1)
    return OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key)


# ---------------------------------------------------------------------------
# State helpers
# ---------------------------------------------------------------------------


def load_state() -> dict:
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"researched_node_ids": [], "cycle_count": 0, "stats": {"total_signals": 0}}


def save_state(state: dict):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2, default=str)


# ---------------------------------------------------------------------------
# JSON extraction (same pattern as funding_researcher.py)
# ---------------------------------------------------------------------------


def _extract_json(content: str, array: bool = True):
    """Robustly extract JSON from LLM responses."""
    content = re.sub(r"```(?:json)?\s*", "", content)
    content = content.strip()

    open_char = "[" if array else "{"
    close_char = "]" if array else "}"

    start = content.find(open_char)
    if start == -1:
        return None

    depth = 0
    in_string = False
    escape_next = False
    for i in range(start, len(content)):
        c = content[i]
        if escape_next:
            escape_next = False
            continue
        if c == "\\" and in_string:
            escape_next = True
            continue
        if c == '"' and not escape_next:
            in_string = not in_string
            continue
        if in_string:
            continue
        if c == open_char:
            depth += 1
        elif c == close_char:
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(content[start : i + 1])
                except json.JSONDecodeError:
                    break

    try:
        decoder = json.JSONDecoder()
        obj, _ = decoder.raw_decode(content, start)
        return obj
    except (json.JSONDecodeError, ValueError):
        pass
    return None


# ---------------------------------------------------------------------------
# Core research logic
# ---------------------------------------------------------------------------


def fetch_event_participants(event_slug: str) -> list[dict]:
    """Get all participants for an event, joined with node names."""
    sb = get_supabase()
    resp = (
        sb.table("event_participants")
        .select("id, node_id, role, sponsor_tier, speaking_track, booth_location")
        .eq("event_slug", event_slug)
        .execute()
    )
    if not resp.data:
        return []

    # Resolve node details
    node_ids = list({p["node_id"] for p in resp.data})
    nodes_resp = sb.table("nodes").select("id, nombre, link, cluster").in_("id", node_ids).execute()
    node_map = {str(n["id"]): n for n in (nodes_resp.data or [])}

    participants = []
    for p in resp.data:
        node = node_map.get(str(p["node_id"]))
        if node:
            participants.append({**p, "node": node})
    return participants


def research_company_signals(company_name: str, url: str | None, context: str) -> list[dict]:
    """Query Perplexity Sonar for intelligence signals about a company.

    Returns a list of signal dicts ready for node_intelligence insertion.
    """
    client = get_openrouter()
    url_hint = f" (website: {url})" if url else ""

    prompt = f"""Research recent news and announcements about "{company_name}"{url_hint}.
This company is attending {context}.

Search for the following types of signals from the last 6 months:
1. GRANTS: Any grants received or awarded (climate, blockchain, innovation grants)
2. PARTNERSHIPS: New partnership announcements with other companies or organizations
3. HIRING: Significant hiring activity, new C-level hires, team expansions
4. PRODUCT LAUNCHES: New product or service launches, platform updates, major releases
5. FUNDING ROUNDS: Seed, Series A/B/C, token sales, treasury raises
6. REGULATORY: Regulatory approvals, compliance milestones, government endorsements
7. SOCIAL SIGNALS: Notable social media presence, conference talks, community milestones

For each signal found, provide:
- intel_type: one of "grant", "partnership", "hiring", "product_launch", "funding_round", "regulatory", "social_signal"
- title: concise headline (max 120 chars)
- content: 1-3 sentence summary of the signal
- source: where you found this (publication name, social platform, etc.)
- url: direct URL to the source if available, otherwise ""
- author: author or organization that published this, if known
- engagement_score: estimated importance 0.0-1.0 (1.0 = major announcement)

Respond ONLY as a JSON array. If nothing found, return [].

Example:
[
  {{
    "intel_type": "funding_round",
    "title": "Company X raises $5M Series A",
    "content": "Company X announced a $5M Series A led by Fund Y to expand operations in LATAM.",
    "source": "TechCrunch",
    "url": "https://example.com/article",
    "author": "John Smith",
    "engagement_score": 0.9
  }}
]"""

    try:
        response = client.chat.completions.create(
            model=SONAR_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=2000,
        )
        content = response.choices[0].message.content or "[]"
        signals = _extract_json(content, array=True)
        if signals and isinstance(signals, list):
            # Validate and clean each signal
            clean = []
            for s in signals:
                intel_type = s.get("intel_type", "social_signal")
                if intel_type not in INTEL_TYPES:
                    intel_type = "social_signal"
                clean.append({
                    "intel_type": intel_type,
                    "title": (s.get("title") or "")[:200],
                    "content": (s.get("content") or "")[:2000],
                    "source": (s.get("source") or "perplexity")[:200],
                    "url": (s.get("url") or "")[:500],
                    "author": (s.get("author") or "")[:200],
                    "engagement_score": max(0.0, min(1.0, float(s.get("engagement_score", 0.5)))),
                })
            return clean
    except Exception as e:
        log.error(f"Perplexity research failed for {company_name}: {e}")

    return []


def store_signals(node_id: str, signals: list[dict]) -> int:
    """Insert intelligence signals into node_intelligence table. Returns count stored."""
    if not signals:
        return 0

    sb = get_supabase()
    stored = 0
    for sig in signals:
        row = {
            "node_id": node_id,
            "intel_type": sig["intel_type"],
            "source": sig["source"],
            "title": sig["title"],
            "content": sig["content"],
            "url": sig.get("url", ""),
            "author": sig.get("author", ""),
            "engagement_score": sig.get("engagement_score", 0.5),
            "detected_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            # Deduplicate: skip if same node + same title already exists
            existing = (
                sb.table("node_intelligence")
                .select("id")
                .eq("node_id", node_id)
                .eq("title", sig["title"])
                .execute()
            )
            if existing.data:
                log.debug(f"  Skipping duplicate signal: {sig['title'][:60]}")
                continue

            resp = sb.table("node_intelligence").insert(row).execute()
            if resp.data:
                stored += 1
        except Exception as e:
            log.error(f"  Failed to store signal '{sig['title'][:50]}': {e}")

    return stored


# ---------------------------------------------------------------------------
# Verification — submit event companies to GenLayer via Vercel API
# ---------------------------------------------------------------------------

VERIFY_API_BASE = os.environ.get("VERIFY_API_BASE", "https://green-panorama-ar.vercel.app")
MAX_VERIFY_PER_CYCLE = 3
VERIFY_POLL_ATTEMPTS = 60  # 60 * 10s = 10 min max


async def verify_event_companies(event_slug: str, max_nodes: int = MAX_VERIFY_PER_CYCLE) -> dict:
    """Find unverified event participants and submit for GenLayer verification."""
    sb = get_supabase()

    # Get event participants joined with node verification status
    participants = fetch_event_participants(event_slug)
    if not participants:
        return {"verified": 0, "failed": 0, "skipped": 0}

    node_ids = [str(p["node_id"]) for p in participants]
    nodes_resp = (
        sb.table("nodes")
        .select("id, nombre, link, cluster, categoria, descripcion, verification_status, verified")
        .in_("id", node_ids)
        .execute()
    )

    # Filter to unverified nodes (not verified, not pending, not grey)
    unverified = [
        n for n in (nodes_resp.data or [])
        if not n.get("verified") and n.get("verification_status") not in ("verified", "pending", "grey")
    ]

    if not unverified:
        log.info("All event participants are already verified or pending.")
        return {"verified": 0, "failed": 0, "skipped": 0}

    log.info(f"Found {len(unverified)} unverified event participants, verifying up to {max_nodes}")
    batch = unverified[:max_nodes]
    results = {"verified": 0, "failed": 0, "timeout": 0}

    try:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            for node in batch:
                node_id = str(node["id"])
                nombre = node["nombre"]
                link = node.get("link", "")

                # Mark as pending
                sb.table("nodes").update({"verification_status": "pending"}).eq("id", node_id).execute()

                # Submit verification
                payload = {
                    "nodeId": node_id,
                    "nombre": nombre,
                    "link": link,
                    "cluster": node.get("cluster", ""),
                    "categoria": node.get("categoria", ""),
                    "descripcion": node.get("descripcion", ""),
                    "country": "Brazil",
                }

                try:
                    async with session.post(f"{VERIFY_API_BASE}/api/verify", json=payload) as resp:
                        data = await resp.json()
                        tx_hash = data.get("txHash")
                        if not tx_hash:
                            log.warning(f"  No txHash for {nombre}: {data.get('error', 'unknown')}")
                            sb.table("nodes").update({"verification_status": "unverified"}).eq("id", node_id).execute()
                            results["failed"] += 1
                            continue

                    log.info(f"  Verification submitted for {nombre}: {tx_hash}")

                    # Poll for result
                    for attempt in range(VERIFY_POLL_ATTEMPTS):
                        await asyncio.sleep(10)
                        async with session.get(f"{VERIFY_API_BASE}/api/verify/status?txHash={tx_hash}") as resp:
                            status_data = await resp.json()
                            status = status_data.get("status", "unknown")

                        if status in ("FINALIZED", "ACCEPTED", "accepted", "finalized"):
                            log.info(f"  Verification PASSED for {nombre}")
                            sb.table("nodes").update({
                                "verified": True,
                                "verification_tx": tx_hash,
                                "verification_status": "verified",
                                "verification_failure_reason": None,
                            }).eq("id", node_id).execute()
                            results["verified"] += 1
                            break

                        if status in ("UNDETERMINED", "CANCELED", "undetermined", "canceled"):
                            log.warning(f"  Verification FAILED for {nombre}: {status}")
                            sb.table("nodes").update({
                                "verification_status": "failed",
                                "verification_failure_reason": f"Consensus: {status}",
                            }).eq("id", node_id).execute()
                            results["failed"] += 1
                            break
                    else:
                        log.warning(f"  Verification timed out for {nombre}")
                        sb.table("nodes").update({"verification_status": "unverified"}).eq("id", node_id).execute()
                        results["timeout"] += 1

                except Exception as e:
                    log.error(f"  Verification error for {nombre}: {e}")
                    sb.table("nodes").update({"verification_status": "unverified"}).eq("id", node_id).execute()
                    results["failed"] += 1

                await asyncio.sleep(2)  # Brief pause between nodes

    except ImportError:
        log.error("aiohttp not installed — cannot run verification. pip install aiohttp")
        return results

    log.info(f"Event verification: {results['verified']} verified, {results['failed']} failed, {results['timeout']} timeout")
    return results


# ---------------------------------------------------------------------------
# Relationship discovery — convert signals + Perplexity into graph edges
# ---------------------------------------------------------------------------

# Lazy imports to avoid circular dependencies at module level
_research_imports_loaded = False
_insert_edge = None
_insert_node_with_edge_fn = None
_get_all_names = None
_get_agent_node_count = None
_MAX_AGENT_NODES = 500
_check_duplicate = None
_discover_relationships_deep = None
_research_company_for_event = None


def _load_research_imports():
    """Lazy-load research daemon functions to avoid circular imports."""
    global _research_imports_loaded, _insert_edge, _insert_node_with_edge_fn
    global _get_all_names, _get_agent_node_count, _MAX_AGENT_NODES
    global _check_duplicate, _discover_relationships_deep, _research_company_for_event

    if _research_imports_loaded:
        return

    try:
        from agents.research_daemon import (
            insert_edge, insert_node_with_edge, get_all_names,
            get_agent_node_count, MAX_AGENT_NODES,
        )
        from agents.funding_researcher import discover_relationships_deep
        from agents.db_helpers import check_duplicate
        from agents.research_agent import research_company_for_event

        _insert_edge = insert_edge
        _insert_node_with_edge_fn = insert_node_with_edge
        _get_all_names = get_all_names
        _get_agent_node_count = get_agent_node_count
        _MAX_AGENT_NODES = MAX_AGENT_NODES
        _check_duplicate = check_duplicate
        _discover_relationships_deep = discover_relationships_deep
        _research_company_for_event = research_company_for_event
        _research_imports_loaded = True
    except ImportError as e:
        log.error(f"Could not import research functions: {e}")


def extract_partner_from_signal(signal: dict) -> str | None:
    """Use a cheap LLM to extract the partner company name from an intelligence signal."""
    title = signal.get("title", "")
    content = signal.get("content", "")
    text = f"{title}. {content}".strip()
    if not text or len(text) < 10:
        return None

    try:
        client = get_openrouter()
        response = client.chat.completions.create(
            model=EXTRACT_MODEL,
            messages=[{"role": "user", "content": f"""Extract the OTHER company name from this business signal.
Return ONLY the company name, nothing else. If no clear partner company is mentioned, return "NONE".

Signal: {text}"""}],
            temperature=0.0,
            max_tokens=50,
        )
        result = (response.choices[0].message.content or "").strip()
        if result and result.upper() != "NONE" and len(result) < 100:
            return result
    except Exception as e:
        log.debug(f"Signal extraction failed: {e}")
    return None


def convert_signals_to_edges(batch: list[dict], signals_by_node: dict) -> dict:
    """Phase A: Convert partnership/funding signals into graph edges.

    Args:
        batch: list of participant dicts with node info
        signals_by_node: dict mapping node_id -> list of signals just stored
    """
    _load_research_imports()
    if not _insert_edge or not _get_all_names:
        return {"edges_created": 0, "nodes_created": 0}

    results = {"edges_created": 0, "nodes_created": 0, "extractions": 0}
    all_names = _get_all_names()
    all_names_lower = {n.lower() for n in all_names}
    sb = get_supabase()

    for participant in batch:
        node = participant["node"]
        node_id = str(participant["node_id"])
        company_name = node["nombre"]
        signals = signals_by_node.get(node_id, [])

        # Only look at partnership and funding signals
        relevant = [s for s in signals if s.get("intel_type") in ("partnership", "funding_round")]
        for sig in relevant[:MAX_SIGNAL_EXTRACTIONS_PER_CYCLE]:
            partner_name = extract_partner_from_signal(sig)
            if not partner_name:
                continue
            results["extractions"] += 1

            # Skip if it's the same company
            if partner_name.lower() == company_name.lower():
                continue

            # Determine relationship type from signal
            rel_type = "partners_with"
            if sig.get("intel_type") == "funding_round":
                rel_type = "funds"

            # Check if partner already exists
            if partner_name.lower() in all_names_lower:
                if _insert_edge(company_name, partner_name, rel_type,
                               discovery_method="signal_extraction", confidence=0.6):
                    results["edges_created"] += 1
                    log.info(f"    + Edge from signal: {company_name} --{rel_type}--> {partner_name}")
            else:
                # Check fuzzy match
                is_dup, match, score = _check_duplicate(partner_name, all_names)
                if is_dup:
                    if _insert_edge(company_name, match, rel_type,
                                   discovery_method="signal_extraction", confidence=0.6):
                        results["edges_created"] += 1
                        log.info(f"    + Edge from signal: {company_name} --{rel_type}--> {match} (fuzzy)")
                elif _get_agent_node_count() < _MAX_AGENT_NODES and _research_company_for_event:
                    # New company — research and classify
                    classified = _research_company_for_event(partner_name, None, industry="blockchain/crypto/web3")
                    if classified and _insert_node_with_edge_fn:
                        node_res, edge_ok = _insert_node_with_edge_fn(
                            classified, discovered_from=company_name,
                            source_name=company_name, rel_type=rel_type,
                            depth=1, discovery_method="signal_extraction", confidence=0.6,
                        )
                        if node_res:
                            results["nodes_created"] += 1
                            all_names.append(partner_name)
                            all_names_lower.add(partner_name.lower())
                            if edge_ok:
                                results["edges_created"] += 1
                            log.info(f"    + New node from signal: {partner_name}")

    if results["edges_created"] > 0 or results["nodes_created"] > 0:
        log.info(f"  Signals→Edges: {results['extractions']} extracted, "
                 f"{results['edges_created']} edges, {results['nodes_created']} new nodes")
    return results


def discover_event_relationships(event_slug: str, state: dict, max_nodes: int = MAX_PERPLEXITY_PER_CYCLE) -> dict:
    """Phase B: Deep Perplexity discovery for event participants."""
    _load_research_imports()
    if not _discover_relationships_deep or not _insert_edge:
        return {"searched": 0, "edges_created": 0, "nodes_created": 0}

    sb = get_supabase()
    results = {"searched": 0, "edges_created": 0, "nodes_created": 0}

    # Get participants not yet relationship-discovered
    discovered_ids = set(state.get("relationship_discovered_ids", []))
    participants = fetch_event_participants(event_slug)
    pending = [p for p in participants if str(p["node_id"]) not in discovered_ids]

    if not pending:
        # Reset for next round
        state["relationship_discovered_ids"] = []
        return results

    all_names = _get_all_names()
    all_names_lower = {n.lower() for n in all_names}
    batch = pending[:max_nodes]

    for participant in batch:
        node = participant["node"]
        node_id = str(participant["node_id"])
        company_name = node["nombre"]
        url = node.get("link")

        log.info(f"  Deep discovery: {company_name}")

        # Get event industry/region from event config
        relationships = _discover_relationships_deep(
            company_name, url,
            industry="blockchain/crypto/web3",
            region="global",
        )
        results["searched"] += 1

        for rel in (relationships or []):
            partner_name = rel.get("name", "").strip()
            if not partner_name or partner_name.lower() == company_name.lower():
                continue

            partner_url = rel.get("link")
            relationship = rel.get("relationship", "partner")

            # Map relationship type
            rel_type = "partners_with"
            if relationship in ("funder", "investor", "co_investor", "backed_by"):
                rel_type = "funds"
            elif relationship in ("client", "customer"):
                rel_type = "client_of"
            elif relationship in ("portfolio", "portfolio_company"):
                rel_type = "portfolio"
            elif relationship in ("ecosystem", "integration", "built_on"):
                rel_type = relationship

            # Check if partner already exists
            if partner_name.lower() in all_names_lower:
                if _insert_edge(company_name, partner_name, rel_type,
                               discovery_method="perplexity_event", confidence=0.7):
                    results["edges_created"] += 1
                    evidence = rel.get("evidence", "")[:60]
                    log.info(f"    + Edge: {company_name} --{rel_type}--> {partner_name} [{evidence}]")
                continue

            # Fuzzy match
            is_dup, match, score = _check_duplicate(partner_name, all_names)
            if is_dup:
                if _insert_edge(company_name, match, rel_type,
                               discovery_method="perplexity_event", confidence=0.7):
                    results["edges_created"] += 1
                continue

            # New company — research and add if budget allows
            if _get_agent_node_count() >= _MAX_AGENT_NODES:
                continue

            if _research_company_for_event:
                classified = _research_company_for_event(
                    partner_name, partner_url, industry="blockchain/crypto/web3",
                )
                if classified and _insert_node_with_edge_fn:
                    node_res, edge_ok = _insert_node_with_edge_fn(
                        classified, discovered_from=company_name,
                        source_name=company_name, rel_type=rel_type,
                        depth=1, discovery_method="perplexity_event", confidence=0.7,
                    )
                    if node_res:
                        results["nodes_created"] += 1
                        all_names.append(partner_name)
                        all_names_lower.add(partner_name.lower())
                        if edge_ok:
                            results["edges_created"] += 1
                        log.info(f"    + New node: {partner_name}")

        # Mark as discovered
        discovered_ids.add(node_id)
        state["relationship_discovered_ids"] = list(discovered_ids)

    if results["edges_created"] > 0 or results["nodes_created"] > 0:
        log.info(f"  Deep discovery: {results['searched']} searched, "
                 f"{results['edges_created']} edges, {results['nodes_created']} new nodes")
    return results


# ---------------------------------------------------------------------------
# Cycle logic
# ---------------------------------------------------------------------------


def run_one_cycle(event_slug: str) -> dict:
    """Run a single research cycle: pick companies, research, store signals."""
    state = load_state()
    researched_ids = set(state.get("researched_node_ids", []))

    log.info(f"Fetching participants for event: {event_slug}")
    participants = fetch_event_participants(event_slug)

    if not participants:
        log.warning(f"No participants found for event '{event_slug}'")
        return {"status": "no_participants", "event": event_slug}

    # Filter to companies not yet researched
    pending = [p for p in participants if str(p["node_id"]) not in researched_ids]
    log.info(f"Participants: {len(participants)} total, {len(pending)} pending research")

    if not pending:
        log.info("All event participants have been researched this round.")
        # Reset researched list to allow re-scanning on next full pass
        state["researched_node_ids"] = []
        save_state(state)
        return {"status": "cycle_complete", "total": len(participants), "new_signals": 0}

    # Process a batch — intelligence signals
    batch = pending[:COMPANIES_PER_CYCLE]
    total_signals = 0
    results = []
    signals_by_node = {}  # Track for Phase A

    for participant in batch:
        node = participant["node"]
        node_id = str(participant["node_id"])
        company_name = node["nombre"]
        url = node.get("link")
        role = participant.get("role", "attendee")
        tier = participant.get("sponsor_tier", "")

        context_parts = [f"BlockchainRio 2026 as {role}"]
        if tier:
            context_parts.append(f"({tier} sponsor)")
        context = " ".join(context_parts)

        log.info(f"Researching: {company_name} [{context}]")

        signals = research_company_signals(company_name, url, context)
        stored = store_signals(node_id, signals)
        total_signals += stored
        signals_by_node[node_id] = signals  # Keep for Phase A

        # Mark as researched
        researched_ids.add(node_id)

        results.append({
            "company": company_name,
            "signals_found": len(signals),
            "signals_stored": stored,
        })
        log.info(f"  Found {len(signals)} signals, stored {stored} new")

        # Brief pause between API calls
        time.sleep(2)

    # Phase A: Convert partnership signals into graph edges (free LLM calls)
    log.info("--- Phase A: Converting signals to edges ---")
    signal_edge_results = convert_signals_to_edges(batch, signals_by_node)

    # Phase B: Deep relationship discovery via Perplexity (3 per cycle)
    log.info("--- Phase B: Deep relationship discovery ---")
    deep_results = discover_event_relationships(event_slug, state, max_nodes=MAX_PERPLEXITY_PER_CYCLE)

    # Run verification pass on event companies
    verify_results = asyncio.run(verify_event_companies(event_slug))

    # Update state
    state["researched_node_ids"] = list(researched_ids)
    state["cycle_count"] = state.get("cycle_count", 0) + 1
    state["stats"]["total_signals"] = state["stats"].get("total_signals", 0) + total_signals
    state["stats"]["total_verified"] = state["stats"].get("total_verified", 0) + verify_results.get("verified", 0)
    state["stats"]["signal_edges_created"] = (
        state["stats"].get("signal_edges_created", 0) + signal_edge_results.get("edges_created", 0)
    )
    state["stats"]["deep_edges_created"] = (
        state["stats"].get("deep_edges_created", 0) + deep_results.get("edges_created", 0)
    )
    state["stats"]["connection_nodes_created"] = (
        state["stats"].get("connection_nodes_created", 0)
        + signal_edge_results.get("nodes_created", 0)
        + deep_results.get("nodes_created", 0)
    )
    state["last_cycle"] = datetime.now(timezone.utc).isoformat()
    save_state(state)

    total_new_edges = signal_edge_results.get("edges_created", 0) + deep_results.get("edges_created", 0)
    total_new_nodes = signal_edge_results.get("nodes_created", 0) + deep_results.get("nodes_created", 0)

    summary = {
        "status": "ok",
        "event": event_slug,
        "cycle": state["cycle_count"],
        "companies_researched": len(batch),
        "companies_remaining": len(pending) - len(batch),
        "new_signals": total_signals,
        "new_edges": total_new_edges,
        "new_connection_nodes": total_new_nodes,
        "verification": verify_results,
        "results": results,
    }
    log.info(
        f"Cycle {state['cycle_count']} done: {len(batch)} companies, "
        f"{total_signals} signals, {total_new_edges} edges, {total_new_nodes} new nodes, "
        f"{len(pending) - len(batch)} remaining"
    )
    return summary


def daemon_loop(interval: int, event_slug: str):
    """Main daemon loop. Runs cycles at the given interval."""
    log.info(f"Event intelligence daemon starting — event={event_slug}, interval={interval}s")
    log.info(f"State file: {STATE_FILE}")

    cycle = 0
    while _running:
        cycle += 1
        log.info(f"=== Cycle {cycle} ===")

        try:
            summary = run_one_cycle(event_slug)
            log.info(f"Cycle summary: {json.dumps(summary, indent=2)}")
        except Exception as e:
            log.error(f"Cycle {cycle} failed: {e}", exc_info=True)

        # Wait for next cycle, checking _running every second for graceful shutdown
        for _ in range(interval):
            if not _running:
                break
            time.sleep(1)

    log.info("Event daemon stopped.")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description="Green Panorama Event Intelligence Daemon")
    parser.add_argument("--once", action="store_true", help="Run a single cycle then exit")
    parser.add_argument("--interval", type=int, default=900, help="Seconds between cycles (default: 900 = 15 min)")
    parser.add_argument("--event-slug", type=str, default=DEFAULT_EVENT_SLUG, help=f"Event slug (default: {DEFAULT_EVENT_SLUG})")
    args = parser.parse_args()

    if args.once:
        log.info(f"Running single cycle for event: {args.event_slug}")
        summary = run_one_cycle(args.event_slug)
        print(json.dumps(summary, indent=2))
    else:
        daemon_loop(interval=args.interval, event_slug=args.event_slug)


if __name__ == "__main__":
    main()
