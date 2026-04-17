"""
Green Panorama Verification Health Monitor

Daemon that runs every 30 minutes and checks:
1. Verification pipeline health — are verifications actually happening?
2. Stuck nodes — any nodes stuck in "pending" for too long?
3. GenLayer responsiveness — can we reach the Vercel API / GenLayer?
4. Verification growth — is the verified count increasing over time?
5. Per-node coverage — which verification types are missing per node?

Stores health snapshots in Supabase (health_snapshots table) and logs alerts.

Run:
  python -m agents.health_monitor                  # Run continuously (every 30 min)
  python -m agents.health_monitor --once            # Single check then exit
  python -m agents.health_monitor --interval 600    # Every 10 minutes
  python -m agents.health_monitor --unstick         # Also fix stuck pending nodes
"""

import argparse
import asyncio
import json
import logging
import os
import signal
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent / ".env")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
VERIFY_API_BASE = os.environ.get("VERIFY_API_BASE", "https://green-panorama-ar.vercel.app")
STATE_FILE = Path(os.getenv("STATE_DIR", Path(__file__).parent.parent / "data")) / "health_monitor_state.json"

# Thresholds
PENDING_TIMEOUT_MINUTES = 15       # Node pending longer than this = stuck
MIN_VERIFICATIONS_PER_30MIN = 0    # Alert if fewer than this (0 = just track)
GROWTH_WINDOW_HOURS = 2            # Check growth over this window

# Telegram notifications via Bot API (works from inside Docker containers)
TELEGRAM_ENABLED = True
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "8170035332:AAFV-yK6t_NNuwdE7EwIn72x7OG6EDlpiik")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "1798551099")

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("health_monitor")

# ---------------------------------------------------------------------------
# Graceful shutdown
# ---------------------------------------------------------------------------

_running = True


def _handle_signal(signum, frame):
    global _running
    log.info(f"Received signal {signum}, shutting down...")
    _running = False


signal.signal(signal.SIGTERM, _handle_signal)
signal.signal(signal.SIGINT, _handle_signal)

# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------


def get_supabase():
    if not SUPABASE_URL or not SUPABASE_KEY:
        log.error("SUPABASE_URL and SUPABASE_KEY must be set")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_KEY)


# ---------------------------------------------------------------------------
# State helpers
# ---------------------------------------------------------------------------


def load_state() -> dict:
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"snapshots": [], "alerts": []}


def save_state(state: dict):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2, default=str)


# ---------------------------------------------------------------------------
# Telegram notifications via OpenClaw
# ---------------------------------------------------------------------------


def send_telegram(message: str):
    """Send a message to Telegram via the Bot API (no external deps needed)."""
    if not TELEGRAM_ENABLED or not TELEGRAM_BOT_TOKEN:
        return
    try:
        import urllib.request
        import urllib.parse
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        data = urllib.parse.urlencode({
            "chat_id": TELEGRAM_CHAT_ID,
            "text": message,
            "parse_mode": "HTML",
        }).encode()
        req = urllib.request.Request(url, data=data, method="POST")
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status == 200:
                log.info("Telegram notification sent")
            else:
                log.warning(f"Telegram API returned {resp.status}")
    except Exception as e:
        log.warning(f"Telegram send error: {e}")


def format_status_message(snapshot: dict) -> str:
    """Format a concise Telegram status message (HTML format)."""
    alerts = snapshot.get("alerts", [])
    has_critical = any(a["severity"] == "critical" for a in alerts)
    has_warning = any(a["severity"] == "warning" for a in alerts)

    if has_critical:
        icon = "🔴"
        status = "CRITICAL"
    elif has_warning:
        icon = "🟡"
        status = "WARNING"
    else:
        icon = "🟢"
        status = "HEALTHY"

    lines = [f"{icon} <b>IndustriesVerified — {status}</b>"]
    lines.append("")

    # Verification stats
    lines.append(
        f"Verified: <b>{snapshot['verified']}/{snapshot['total']}</b> "
        f"({snapshot['coverage_pct']}%)"
    )

    # Verification growth
    g30 = snapshot.get("growth_30min")
    g2h = snapshot.get("growth_2h")
    if g30 is not None or g2h is not None:
        growth_parts = []
        if g30 is not None:
            arrow = "📈" if g30 > 0 else ("📉" if g30 < 0 else "➡️")
            growth_parts.append(f"{arrow} +{g30} (30m)")
        if g2h is not None:
            arrow = "📈" if g2h > 0 else ("📉" if g2h < 0 else "➡️")
            growth_parts.append(f"{arrow} +{g2h} (2h)")
        lines.append(f"Growth: {' | '.join(growth_parts)}")

    # Edge and event map stats
    total_edges = snapshot.get("total_edges", 0)
    event_edges = snapshot.get("event_edges", 0)
    event_connections = snapshot.get("event_connections", 0)
    if total_edges > 0:
        lines.append(f"🔗 Edges: {total_edges} total")
    if event_edges > 0 or event_connections > 0:
        lines.append(f"🗺 Event map: {event_edges} edges, {event_connections} connections")

    # Issues
    if snapshot.get("pending", 0) > 0:
        lines.append(f"⏳ Pending: {snapshot['pending']}")
    if snapshot.get("failed", 0) > 0:
        lines.append(f"❌ Failed: {snapshot['failed']}")
    auto_fixed = snapshot.get("stuck_auto_fixed", 0)
    if auto_fixed > 0:
        lines.append(f"🔧 Auto-fixed {auto_fixed} stuck nodes")

    lines.append(f"API: {snapshot.get('api_health', '?')}")

    if alerts:
        lines.append("")
        for a in alerts[:3]:
            sev = "⚠️" if a["severity"] == "warning" else "🚨"
            lines.append(f"{sev} {a['message']}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Health checks
# ---------------------------------------------------------------------------


def check_verification_stats(sb) -> dict:
    """Query Supabase for current verification status breakdown."""
    resp = sb.table("nodes").select(
        "id, nombre, verified, verification_status, verification_attempts, "
        "verification_failure_reason, updated_at"
    ).execute()

    nodes = resp.data or []
    total = len(nodes)

    status_counts = {}
    for n in nodes:
        vs = n.get("verification_status", "unverified") or "unverified"
        status_counts[vs] = status_counts.get(vs, 0) + 1

    verified_count = status_counts.get("verified", 0)
    pending_count = status_counts.get("pending", 0)
    failed_count = status_counts.get("failed", 0)
    grey_count = status_counts.get("grey", 0)
    unverified_count = status_counts.get("unverified", 0)

    # Calculate verification coverage percentage
    coverage = (verified_count / total * 100) if total > 0 else 0

    return {
        "total_nodes": total,
        "verified": verified_count,
        "pending": pending_count,
        "failed": failed_count,
        "grey": grey_count,
        "unverified": unverified_count,
        "coverage_pct": round(coverage, 1),
        "status_breakdown": status_counts,
        "nodes": nodes,
    }


def check_stuck_pending(nodes: list, unstick: bool = False) -> dict:
    """Find nodes stuck in 'pending' status for too long."""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=PENDING_TIMEOUT_MINUTES)
    stuck = []

    for n in nodes:
        if (n.get("verification_status") or "unverified") != "pending":
            continue
        updated = n.get("updated_at")
        if not updated:
            stuck.append(n)
            continue
        try:
            if isinstance(updated, str):
                # Handle ISO format with or without timezone
                updated_dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
            else:
                updated_dt = updated
            if updated_dt < cutoff:
                stuck.append(n)
        except (ValueError, TypeError):
            stuck.append(n)

    unstuck_count = 0
    if unstick and stuck:
        sb = get_supabase()
        for n in stuck:
            sb.table("nodes").update({
                "verification_status": "unverified"
            }).eq("id", n["id"]).execute()
            unstuck_count += 1
            log.warning(f"  UNSTUCK: {n['nombre']} (was pending for >{PENDING_TIMEOUT_MINUTES}min)")

    return {
        "stuck_count": len(stuck),
        "stuck_nodes": [{"id": str(n["id"]), "nombre": n["nombre"]} for n in stuck[:20]],
        "unstuck": unstuck_count,
    }


async def check_genlayer_api() -> dict:
    """Check if the Vercel API and GenLayer are reachable."""
    import aiohttp

    checks = {}

    # Check 1: Can we reach the Vercel frontend?
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{VERIFY_API_BASE}/api/graph",
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                checks["vercel_api"] = {
                    "status": "ok" if resp.status == 200 else "error",
                    "http_status": resp.status,
                    "response_time_ms": 0,  # aiohttp doesn't expose this easily
                }
    except Exception as e:
        checks["vercel_api"] = {"status": "unreachable", "error": str(e)[:200]}

    # Check 2: Can we read from the GenLayer contract via the API?
    try:
        async with aiohttp.ClientSession() as session:
            # Use verify/status with a fake hash — should return PENDING or error, not crash
            async with session.get(
                f"{VERIFY_API_BASE}/api/verify/status?txHash=0x0000000000000000000000000000000000000000",
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                data = await resp.json()
                checks["genlayer_read"] = {
                    "status": "ok" if resp.status == 200 else "degraded",
                    "http_status": resp.status,
                    "response_status": data.get("status", "unknown"),
                }
    except Exception as e:
        checks["genlayer_read"] = {"status": "unreachable", "error": str(e)[:200]}

    # Overall health
    all_ok = all(c.get("status") == "ok" for c in checks.values())
    any_down = any(c.get("status") == "unreachable" for c in checks.values())

    return {
        "overall": "healthy" if all_ok else ("down" if any_down else "degraded"),
        "checks": checks,
    }


def check_verification_growth(state: dict, current_verified: int) -> dict:
    """Check if verified count is growing over time."""
    snapshots = state.get("snapshots", [])
    now = datetime.now(timezone.utc)

    # Find snapshot from ~30 min ago and ~2 hours ago
    result = {
        "current_verified": current_verified,
        "growth_30min": None,
        "growth_2h": None,
        "stalled": False,
    }

    cutoff_30 = now - timedelta(minutes=35)
    cutoff_2h = now - timedelta(hours=GROWTH_WINDOW_HOURS + 0.1)

    snap_30 = None
    snap_2h = None
    for s in reversed(snapshots):
        try:
            ts = datetime.fromisoformat(s["ts"].replace("Z", "+00:00"))
        except (ValueError, KeyError):
            continue
        if snap_30 is None and ts <= cutoff_30:
            snap_30 = s
        if snap_2h is None and ts <= cutoff_2h:
            snap_2h = s
        if snap_30 and snap_2h:
            break

    if snap_30:
        result["growth_30min"] = current_verified - snap_30.get("verified", 0)

    if snap_2h:
        result["growth_2h"] = current_verified - snap_2h.get("verified", 0)
        # Stalled = zero growth over 2 hours AND there are unverified nodes remaining
        if result["growth_2h"] == 0:
            result["stalled"] = True

    return result


def check_verification_coverage(sb) -> dict:
    """Check which verification types have been done per node on GenLayer.

    Queries the Vercel API for contract stats — if verification_count is 0
    or not growing, something is wrong.
    """
    # We can check this via Supabase: count nodes with verification_tx set
    resp = sb.table("nodes").select("id, nombre, verified, verification_tx").execute()
    nodes = resp.data or []

    with_tx = [n for n in nodes if n.get("verification_tx")]
    without_tx = [n for n in nodes if n.get("verified") and not n.get("verification_tx")]

    return {
        "nodes_with_onchain_tx": len(with_tx),
        "verified_but_no_tx": len(without_tx),
        "total_nodes": len(nodes),
    }


# ---------------------------------------------------------------------------
# Alert generation
# ---------------------------------------------------------------------------


def generate_alerts(stats: dict, stuck: dict, api: dict, growth: dict) -> list:
    """Generate alerts based on health check results."""
    alerts = []

    # Alert: Stuck pending nodes — only if NOT auto-fixed (remaining after unstick)
    remaining_stuck = stuck["stuck_count"] - stuck.get("unstuck", 0)
    if remaining_stuck > 0:
        alerts.append({
            "severity": "warning",
            "type": "stuck_pending",
            "message": f"{remaining_stuck} nodes stuck in pending for >{PENDING_TIMEOUT_MINUTES}min (could not auto-fix)",
            "nodes": [n["nombre"] for n in stuck["stuck_nodes"][:5]],
        })

    # Alert: GenLayer API down
    if api["overall"] == "down":
        alerts.append({
            "severity": "critical",
            "type": "api_down",
            "message": f"GenLayer/Vercel API is unreachable: {api['checks']}",
        })
    elif api["overall"] == "degraded":
        alerts.append({
            "severity": "warning",
            "type": "api_degraded",
            "message": f"GenLayer/Vercel API is degraded: {api['checks']}",
        })

    # Alert: Zero verification growth
    if growth.get("stalled") and stats["unverified"] > 0:
        alerts.append({
            "severity": "critical",
            "type": "verification_stalled",
            "message": f"No new verifications in {GROWTH_WINDOW_HOURS}h. "
                       f"{stats['unverified']} nodes still unverified.",
        })

    # Alert: High failure rate
    total_attempted = stats["verified"] + stats["failed"] + stats["grey"]
    if total_attempted > 5:
        failure_rate = (stats["failed"] + stats["grey"]) / total_attempted
        if failure_rate > 0.5:
            alerts.append({
                "severity": "warning",
                "type": "high_failure_rate",
                "message": f"Verification failure rate: {failure_rate:.0%} "
                           f"({stats['failed']} failed + {stats['grey']} grey / {total_attempted} total)",
            })

    # Alert: Too many pending
    if stats["pending"] > 10:
        alerts.append({
            "severity": "warning",
            "type": "pending_overload",
            "message": f"{stats['pending']} nodes currently pending verification — possible backlog",
        })

    return alerts


# ---------------------------------------------------------------------------
# Store snapshot in Supabase
# ---------------------------------------------------------------------------


def store_snapshot(sb, snapshot: dict):
    """Try to store the health snapshot in Supabase health_snapshots table.

    If the table doesn't exist, just log it (the monitor still works via local state).
    """
    try:
        sb.table("health_snapshots").insert({
            "snapshot": json.dumps(snapshot, default=str),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception:
        # Table might not exist yet — that's fine, we use local state
        pass


# ---------------------------------------------------------------------------
# Main check
# ---------------------------------------------------------------------------


async def run_health_check(unstick: bool = False) -> dict:
    """Run all health checks and return a comprehensive report."""
    sb = get_supabase()
    state = load_state()

    log.info("=== Health Check ===")

    # 1. Verification stats
    stats = check_verification_stats(sb)
    log.info(
        f"Nodes: {stats['total_nodes']} total | "
        f"{stats['verified']} verified ({stats['coverage_pct']}%) | "
        f"{stats['pending']} pending | "
        f"{stats['failed']} failed | "
        f"{stats['grey']} grey | "
        f"{stats['unverified']} unverified"
    )

    # 2. Stuck pending
    stuck = check_stuck_pending(stats["nodes"], unstick=unstick)
    if stuck["stuck_count"] > 0:
        log.warning(f"STUCK: {stuck['stuck_count']} nodes pending >{PENDING_TIMEOUT_MINUTES}min")
        if stuck["unstuck"] > 0:
            log.info(f"  Auto-unstuck {stuck['unstuck']} nodes")

    # 3. GenLayer API health
    api = await check_genlayer_api()
    log.info(f"API health: {api['overall']}")
    for name, check in api["checks"].items():
        status = check.get("status", "unknown")
        log.info(f"  {name}: {status}")

    # 4. Verification growth
    growth = check_verification_growth(state, stats["verified"])
    if growth["growth_30min"] is not None:
        log.info(f"Growth: +{growth['growth_30min']} verified in last 30min")
    if growth["growth_2h"] is not None:
        log.info(f"Growth: +{growth['growth_2h']} verified in last {GROWTH_WINDOW_HOURS}h")
    if growth["stalled"]:
        log.warning("STALLED: No verification growth in the last 2 hours!")

    # 5. Coverage check
    coverage = check_verification_coverage(sb)
    log.info(
        f"On-chain: {coverage['nodes_with_onchain_tx']} nodes with TX | "
        f"{coverage['verified_but_no_tx']} verified without TX"
    )

    # 5b. Edge and connection stats
    edges_count_resp = sb.table("edges").select("id", count="exact").execute()
    total_edges = edges_count_resp.count or 0

    # Event participant connection stats — use targeted query to avoid pagination limits
    event_parts = sb.table("event_participants").select("node_id").eq("event_slug", "blockchainrio-2026").execute()
    event_node_ids = {p["node_id"] for p in (event_parts.data or [])}

    # Fetch edges involving event participants using OR filter (avoids 1000-row limit issue)
    participant_id_list = ",".join(event_node_ids)
    event_edges_resp = sb.table("edges").select("source_id, target_id").or_(
        f"source_id.in.({participant_id_list}),target_id.in.({participant_id_list})"
    ).execute()
    event_edges = event_edges_resp.data or []

    # Connected non-participant nodes
    connected_non_participants = set()
    for e in event_edges:
        if e["source_id"] not in event_node_ids:
            connected_non_participants.add(e["source_id"])
        if e["target_id"] not in event_node_ids:
            connected_non_participants.add(e["target_id"])

    log.info(f"Edges: {total_edges} total")
    log.info(f"Event map: {len(event_edges)} edges, {len(connected_non_participants)} connections")

    # 6. Generate alerts
    alerts = generate_alerts(stats, stuck, api, growth)
    for alert in alerts:
        severity = alert["severity"].upper()
        log.warning(f"ALERT [{severity}]: {alert['message']}")

    # Build snapshot
    snapshot = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "verified": stats["verified"],
        "pending": stats["pending"],
        "failed": stats["failed"],
        "grey": stats["grey"],
        "unverified": stats["unverified"],
        "total": stats["total_nodes"],
        "coverage_pct": stats["coverage_pct"],
        "stuck_pending": stuck["stuck_count"],
        "stuck_auto_fixed": stuck.get("unstuck", 0),
        "api_health": api["overall"],
        "growth_30min": growth["growth_30min"],
        "growth_2h": growth["growth_2h"],
        "stalled": growth["stalled"],
        "onchain_txs": coverage["nodes_with_onchain_tx"],
        "total_edges": total_edges,
        "event_edges": len(event_edges),
        "event_connections": len(connected_non_participants),
        "alert_count": len(alerts),
        "alerts": alerts,
    }

    # Save to local state (keep last 200 snapshots)
    state["snapshots"].append(snapshot)
    state["snapshots"] = state["snapshots"][-200:]
    if alerts:
        for a in alerts:
            a["ts"] = snapshot["ts"]
        state["alerts"] = (state.get("alerts", []) + alerts)[-500:]
    state["last_check"] = snapshot["ts"]
    save_state(state)

    # Store in Supabase
    store_snapshot(sb, snapshot)

    status = "HEALTHY" if not alerts else (
        "CRITICAL" if any(a["severity"] == "critical" for a in alerts) else "WARNING"
    )
    log.info(f"=== Health: {status} | {len(alerts)} alerts ===")

    # Send Telegram notification
    # Always send if there are alerts; send healthy status every 4th check (~2h)
    # Use a dedicated counter that increments monotonically per container lifetime
    cycle_num = state.get("_telegram_cycle", 0) + 1
    state["_telegram_cycle"] = cycle_num
    save_state(state)
    should_notify = bool(alerts) or (cycle_num == 1) or (cycle_num % 4 == 0)
    if should_notify:
        msg = format_status_message(snapshot)
        send_telegram(msg)

    return snapshot


# ---------------------------------------------------------------------------
# CLI: show history
# ---------------------------------------------------------------------------


def cmd_history(limit: int = 10):
    """Print recent health snapshots."""
    state = load_state()
    snapshots = state.get("snapshots", [])[-limit:]

    if not snapshots:
        print("No health snapshots yet.")
        return

    print(f"{'Timestamp':<22} {'Verified':>8} {'Pending':>8} {'Failed':>7} {'Grey':>5} "
          f"{'Unverif':>8} {'Cover%':>7} {'API':>10} {'+30m':>5} {'+2h':>5} {'Alerts':>7}")
    print("-" * 110)

    for s in snapshots:
        ts = s.get("ts", "?")[:19]
        print(
            f"{ts:<22} {s.get('verified', 0):>8} {s.get('pending', 0):>8} "
            f"{s.get('failed', 0):>7} {s.get('grey', 0):>5} {s.get('unverified', 0):>8} "
            f"{s.get('coverage_pct', 0):>6.1f}% {s.get('api_health', '?'):>10} "
            f"{s.get('growth_30min', '?'):>5} {s.get('growth_2h', '?'):>5} "
            f"{s.get('alert_count', 0):>7}"
        )


def cmd_alerts(limit: int = 20):
    """Print recent alerts."""
    state = load_state()
    alerts = state.get("alerts", [])[-limit:]

    if not alerts:
        print("No alerts.")
        return

    for a in alerts:
        ts = a.get("ts", "?")[:19]
        severity = a.get("severity", "?").upper()
        atype = a.get("type", "?")
        msg = a.get("message", "")
        print(f"[{ts}] {severity:>8} | {atype:<25} | {msg}")


# ---------------------------------------------------------------------------
# Daemon loop
# ---------------------------------------------------------------------------


def daemon_loop(interval: int, unstick: bool = False):
    """Main daemon loop."""
    log.info(f"Health monitor starting — interval={interval}s, unstick={unstick}")
    log.info(f"API base: {VERIFY_API_BASE}")
    log.info(f"State file: {STATE_FILE}")

    cycle = 0
    while _running:
        cycle += 1
        try:
            snapshot = asyncio.run(run_health_check(unstick=unstick))
            alert_count = snapshot.get("alert_count", 0)
            if alert_count > 0:
                log.warning(f"Cycle {cycle} complete: {alert_count} alerts")
            else:
                log.info(f"Cycle {cycle} complete: all healthy")
        except Exception as e:
            log.error(f"Cycle {cycle} failed: {e}", exc_info=True)

        # Wait, checking _running every second
        for _ in range(interval):
            if not _running:
                break
            time.sleep(1)

    log.info("Health monitor stopped.")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description="Green Panorama Verification Health Monitor")
    parser.add_argument("--once", action="store_true", help="Run a single check then exit")
    parser.add_argument("--interval", type=int, default=1800, help="Seconds between checks (default: 1800 = 30 min)")
    parser.add_argument("--unstick", action="store_true", help="Auto-reset stuck pending nodes to unverified")
    parser.add_argument("--history", type=int, nargs="?", const=10, help="Show recent snapshots")
    parser.add_argument("--alerts", type=int, nargs="?", const=20, help="Show recent alerts")
    args = parser.parse_args()

    if args.history is not None:
        cmd_history(args.history)
        return

    if args.alerts is not None:
        cmd_alerts(args.alerts)
        return

    if args.once:
        snapshot = asyncio.run(run_health_check(unstick=args.unstick))
        print(json.dumps(snapshot, indent=2, default=str))
    else:
        daemon_loop(interval=args.interval, unstick=args.unstick)


if __name__ == "__main__":
    main()
