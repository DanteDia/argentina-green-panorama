"""
Backfill quien_fondea for all existing nodes via Perplexity Sonar.

Run once:
  python -m agents.backfill_funding              # All nodes missing funding
  python -m agents.backfill_funding --limit 10   # First 10 only (test)
  python -m agents.backfill_funding --dry-run    # Preview without writing
"""

import argparse
import json
import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from agents.db_helpers import get_supabase, log_event
from agents.funding_researcher import research_funding

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("backfill_funding")


def backfill(limit: int | None = None, dry_run: bool = False):
    sb = get_supabase()

    # Get all nodes with empty or null quien_fondea
    resp = sb.table("nodes").select("id, nombre, link, quien_fondea, cluster").execute()
    nodes = [
        n for n in resp.data
        if not n.get("quien_fondea") or n["quien_fondea"].strip() == ""
    ]

    log.info(f"Found {len(nodes)} nodes with empty quien_fondea (total: {len(resp.data)})")

    if limit:
        nodes = nodes[:limit]
        log.info(f"Processing first {limit} nodes")

    updated = 0
    failed = 0
    skipped = 0

    for i, node in enumerate(nodes, 1):
        nombre = node["nombre"]
        url = node.get("link")
        node_id = node["id"]

        log.info(f"[{i}/{len(nodes)}] Researching funding for: {nombre}")

        funding = research_funding(nombre, url)

        if funding.error:
            log.warning(f"  Failed: {funding.error}")
            failed += 1
            continue

        if not funding.quien_fondea_str or funding.quien_fondea_str.strip() == "":
            log.info(f"  No funding info found")
            skipped += 1
            continue

        log.info(f"  Found: {funding.quien_fondea_str}")

        if not dry_run:
            sb.table("nodes").update({
                "quien_fondea": funding.quien_fondea_str
            }).eq("id", node_id).execute()

            # Create funds edges for discovered funders
            for funder in funding.funders:
                if not funder.funder_name:
                    continue
                # Check if funder exists as a node
                funder_resp = sb.table("nodes").select("id").eq("nombre", funder.funder_name).execute()
                if funder_resp.data:
                    funder_id = funder_resp.data[0]["id"]
                    # Check edge doesn't exist
                    existing = (
                        sb.table("edges").select("id")
                        .eq("source_id", funder_id)
                        .eq("target_id", node_id)
                        .execute()
                    )
                    if not existing.data:
                        sb.table("edges").insert({
                            "source_id": funder_id,
                            "target_id": node_id,
                            "relationship_type": "funds",
                            "description": f"{funder.funder_name} funds {nombre}",
                            "confidence": 0.7,
                            "source": "agent",
                            "discovery_method": "perplexity",
                        }).execute()
                        log.info(f"  + Edge: {funder.funder_name} --funds--> {nombre}")

            log_event("backfill_funding", company=nombre, funders=funding.quien_fondea_str)

        updated += 1

        # Rate limit: 1 second between Perplexity calls
        time.sleep(1)

    log.info(f"\n=== Backfill Complete ===")
    log.info(f"Updated: {updated}")
    log.info(f"No info found: {skipped}")
    log.info(f"Failed: {failed}")
    log.info(f"{'(DRY RUN - no writes)' if dry_run else ''}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill funding data")
    parser.add_argument("--limit", type=int, default=None, help="Max nodes to process")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing to DB")
    args = parser.parse_args()

    backfill(limit=args.limit, dry_run=args.dry_run)
