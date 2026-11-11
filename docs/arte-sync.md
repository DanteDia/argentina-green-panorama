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

## Arte al Día open calls (news articles)

`artealdia_calls.py` reads news articles, not call pages, so dates in the text are often a residency period or an
event, not a deadline. Each article prints its own status under the headline (`<published date> Open|Closed`), and
the script trusts that:

- **Open**: the first future date near call/deadline words is the deadline; with none, the call is listed "fecha a confirmar".
- **Closed**, or no marker: the call keeps a past date, so the app reads it as closed and stops listing it. Before
  this rule, ~180 old articles showed up as "recurrente" and a few closed calls as open.
- Calls for galleries (not artists) are skipped.
- `sync_supabase.py` cleans the headlines into program names and deletes `aad-*` programs that left the source,
  unless an artist already applied to one.

`programas.py` pins `HOY` to the day the curated list was verified; the news script uses the real date.

**The escena-arte pipeline is not under version control** (it lives in `/Users/Macbook/artme/escena-arte`).
Changes to it are not reviewable or recoverable from this repo.

## Syncing production

Production's database URL is in the Vercel project (see CLAUDE.md, "Production database access"):

```bash
cd /tmp && rm -rf ivprod && mkdir ivprod && cd ivprod \
  && vercel link --yes --scope darolas-projects --project green-panorama-ar \
  && vercel env pull .env.prod --environment=production --yes; \
  U="$(grep '^POSTGRES_URL_NON_POOLING=' .env.prod 2>/dev/null | cut -d= -f2- | tr -d '"')"; cd /tmp && rm -rf ivprod; \
  if [ -n "$U" ]; then (cd /Users/Macbook/artme/escena-arte && ARTE_DATABASE_URL="$U" python3 sync_supabase.py --solo programas); \
  else echo "no production URL: nothing was synced"; fi; unset U
```

Two things this command is careful about: it only syncs when the production URL was actually read (without it,
`sync_supabase.py` falls back to the **local** database and prints the same success line), and the URL is passed to
that one run instead of being exported, so a later plain `python3 sync_supabase.py` still goes to local.

