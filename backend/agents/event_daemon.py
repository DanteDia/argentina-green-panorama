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

    # Process a batch
    batch = pending[:COMPANIES_PER_CYCLE]
    total_signals = 0
    results = []

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

    # Update state
    state["researched_node_ids"] = list(researched_ids)
    state["cycle_count"] = state.get("cycle_count", 0) + 1
    state["stats"]["total_signals"] = state["stats"].get("total_signals", 0) + total_signals
    state["last_cycle"] = datetime.now(timezone.utc).isoformat()
    save_state(state)

    summary = {
        "status": "ok",
        "event": event_slug,
        "cycle": state["cycle_count"],
        "companies_researched": len(batch),
        "companies_remaining": len(pending) - len(batch),
        "new_signals": total_signals,
        "results": results,
    }
    log.info(
        f"Cycle {state['cycle_count']} done: {len(batch)} companies, "
        f"{total_signals} new signals, {len(pending) - len(batch)} remaining"
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
