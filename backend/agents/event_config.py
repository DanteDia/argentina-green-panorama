"""
Event configuration and seed loader for EventsVerified.
Loads event seed data from JSON and inserts into Supabase.

Usage:
  python -m agents.event_config --seed blockchainrio-2026
  python -m agents.event_config --list
"""

import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent / ".env")

EVENTS_DIR = Path(__file__).parent.parent / "events"
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")


@dataclass
class EventConfig:
    slug: str
    name: str
    industry: str
    region: str
    event_start: str
    event_end: str
    location: str
    website: str
    seed_companies: list[dict]
    seed_edges: list[dict]


def load_event_config(event_slug: str) -> EventConfig:
    """Load event configuration from JSON file."""
    json_path = EVENTS_DIR / f"{event_slug.replace('-', '_')}.json"
    if not json_path.exists():
        raise FileNotFoundError(f"Event config not found: {json_path}")

    with open(json_path) as f:
        data = json.load(f)

    event = data["event"]
    return EventConfig(
        slug=event["slug"],
        name=event["name"],
        industry=event["industry"],
        region=event["region"],
        event_start=event["event_start"],
        event_end=event["event_end"],
        location=event["location"],
        website=event["website"],
        seed_companies=data["nodes"],
        seed_edges=data["edges"],
    )


def seed_event(event_slug: str) -> None:
    """Seed an event's companies into the database."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_KEY must be set in backend/.env")
        sys.exit(1)

    config = load_event_config(event_slug)
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Check if event already seeded
    existing = (
        sb.table("event_participants")
        .select("id", count="exact")
        .eq("event_slug", config.slug)
        .execute()
    )
    if existing.count and existing.count > 0:
        print(f"Event '{config.slug}' already has {existing.count} participants. Skipping.")
        print("To re-seed: DELETE FROM event_participants WHERE event_slug = '...';")
        return

    print(f"Seeding event: {config.name}")
    print(f"  Industry: {config.industry}, Region: {config.region}")
    print(f"  Companies: {len(config.seed_companies)}, Edges: {len(config.seed_edges)}")
    print()

    name_to_id = {}

    # First, check for existing nodes (may already be in DB from another event)
    for company in config.seed_companies:
        existing_node = (
            sb.table("nodes")
            .select("id, nombre")
            .eq("nombre", company["nombre"])
            .execute()
        )
        if existing_node.data:
            node_id = existing_node.data[0]["id"]
            name_to_id[company["nombre"]] = node_id
            # Update industry/region if not set
            sb.table("nodes").update({
                "industry": company.get("industry", config.industry),
                "region": company.get("region", config.region),
            }).eq("id", node_id).execute()
            print(f"  ~ {company['nombre']} (already exists, linked)")
        else:
            # Insert new node
            row = {
                "nombre": company["nombre"],
                "link": company.get("link"),
                "followers": company.get("followers"),
                "cluster": company.get("cluster", "Infrastructure"),
                "categoria": company.get("categoria", ""),
                "quien_fondea": company.get("quien_fondea", ""),
                "aliados_portfolio": company.get("aliados_portfolio", []),
                "clientes": company.get("clientes", []),
                "descripcion": company.get("descripcion", ""),
                "source": "manual",
                "depth": 0,
                "discovery_method": "manual",
                "industry": company.get("industry", config.industry),
                "region": company.get("region", config.region),
            }
            resp = sb.table("nodes").insert(row).execute()
            if resp.data:
                name_to_id[company["nombre"]] = resp.data[0]["id"]
                print(f"  + {company['nombre']} [{company.get('cluster', '?')}]")

        # Link to event_participants
        node_id = name_to_id.get(company["nombre"])
        if node_id:
            sb.table("event_participants").insert({
                "event_slug": config.slug,
                "node_id": node_id,
                "role": company.get("role"),
                "sponsor_tier": company.get("sponsor_tier"),
            }).execute()

    print(f"\nSeeding {len(config.seed_edges)} edges...")

    inserted_edges = 0
    for edge in config.seed_edges:
        source_id = name_to_id.get(edge["source"])
        target_id = name_to_id.get(edge["target"])
        if source_id and target_id:
            # Check if edge already exists
            existing_edge = (
                sb.table("edges")
                .select("id")
                .eq("source_id", source_id)
                .eq("target_id", target_id)
                .eq("relationship_type", edge["type"])
                .execute()
            )
            if existing_edge.data:
                print(f"  ~ {edge['source']} --{edge['type']}--> {edge['target']} (exists)")
                continue

            row = {
                "source_id": source_id,
                "target_id": target_id,
                "relationship_type": edge["type"],
                "description": edge.get("description", ""),
                "confidence": 1.0,
                "source": "manual",
                "discovery_method": "manual",
            }
            sb.table("edges").insert(row).execute()
            inserted_edges += 1
            print(f"  + {edge['source']} --{edge['type']}--> {edge['target']}")
        else:
            missing = []
            if not source_id:
                missing.append(f"source '{edge['source']}'")
            if not target_id:
                missing.append(f"target '{edge['target']}'")
            print(f"  SKIP: {', '.join(missing)} not found")

    print(f"\nDone! {len(name_to_id)} nodes, {inserted_edges} new edges.")
    print(f"Event '{config.slug}' seeded with {len(name_to_id)} participants.")


def list_events() -> None:
    """List all available event configurations."""
    for f in sorted(EVENTS_DIR.glob("*.json")):
        with open(f) as fh:
            data = json.load(fh)
        event = data["event"]
        print(f"  {event['slug']}: {event['name']} ({event['location']}, {event['event_start']})")
        print(f"    {len(data['nodes'])} companies, {len(data['edges'])} edges")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python -m agents.event_config --seed <event-slug>")
        print("  python -m agents.event_config --list")
        sys.exit(1)

    if sys.argv[1] == "--list":
        print("Available events:")
        list_events()
    elif sys.argv[1] == "--seed" and len(sys.argv) >= 3:
        seed_event(sys.argv[2])
    else:
        print(f"Unknown command: {sys.argv[1]}")
        sys.exit(1)
