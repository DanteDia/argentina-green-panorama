"""
Seed Supabase with the initial 79 nodes and 47 edges from seed_data.json.
Run once: python seed/seed_to_supabase.py
"""

import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SEED_PATH = Path(__file__).parent / "seed_data.json"


def seed():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_KEY must be set in backend/.env")
        sys.exit(1)

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    with open(SEED_PATH) as f:
        data = json.load(f)

    # Check if already seeded
    existing = sb.table("nodes").select("id", count="exact").execute()
    if existing.count and existing.count > 0:
        print(f"Database already has {existing.count} nodes. Skipping seed.")
        print("To re-seed, delete all rows first: DELETE FROM edges; DELETE FROM nodes;")
        return

    print(f"Seeding {len(data['nodes'])} nodes...")

    # Insert nodes
    name_to_id = {}
    for node in data["nodes"]:
        row = {
            "nombre": node["nombre"],
            "link": node.get("link"),
            "followers": node.get("followers"),
            "cluster": node.get("cluster", "Startup"),
            "categoria": node.get("categoria", ""),
            "quien_fondea": node.get("quien_fondea", ""),
            "aliados_portfolio": node.get("aliados_portfolio", []),
            "clientes": node.get("clientes", []),
            "descripcion": node.get("descripcion", ""),
            "source": "manual",
        }
        resp = sb.table("nodes").insert(row).execute()
        if resp.data:
            name_to_id[node["nombre"]] = resp.data[0]["id"]
            print(f"  + {node['nombre']}")

    print(f"\nSeeding {len(data['edges'])} edges...")

    # Insert edges
    inserted_edges = 0
    for edge in data["edges"]:
        source_id = name_to_id.get(edge["source"])
        target_id = name_to_id.get(edge["target"])
        if source_id and target_id:
            row = {
                "source_id": source_id,
                "target_id": target_id,
                "relationship_type": edge["type"],
                "description": edge.get("description", ""),
                "confidence": 1.0,
                "source": "manual",
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

    print(f"\nDone! {len(name_to_id)} nodes, {inserted_edges} edges seeded.")


if __name__ == "__main__":
    seed()
