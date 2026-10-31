# Arte data sync

The Arte cluster's public data (graph, programs, recent shows) is produced offline by the escena-arte pipeline
(`/Users/Macbook/artme/escena-arte`, Python + SQLite) and loaded into Supabase with one idempotent script.

```bash
cd /Users/Macbook/artme/escena-arte
# local Supabase (frontend/supabase, ports 544xx):
python3 sync_supabase.py
# a remote project:
ARTE_DATABASE_URL='postgresql://…' python3 sync_supabase.py [--solo grafo|programas|eventos]
```

- Nodes/edges upsert by `external_id` → deterministic uuid5, so re-runs update instead of duplicating; `industries`
  gains `arte` without losing other clusters' tags.
- Programs get structured `eligibility` / `requirements` from `requisitos.extraer` (regex, ES/EN) with the quoted
  sentence for every field in `evidence`; fields it can't read stay absent ("a confirmar" in the UI).
- Events are venue Instagram posts announcing openings/exhibitions in the last 75 days (date = post date).
- Refresh: re-run the escena-arte steps (programs, enrich, prensa…) then this sync.
