# Arte data sync

The Arte cluster's public data (graph, programs, recent shows) is produced offline by the escena-arte pipeline
(`/Users/Macbook/artme/escena-arte`, Python + SQLite) and loaded into Supabase with one idempotent script.

```bash
cd /Users/Macbook/artme/escena-arte
# local Supabase (frontend/supabase, ports 544xx):
python3 sync_supabase.py
# a remote project (from the Mac only the graph and events: programs sync from the VPS, see "Scheduled run"):
ARTE_DATABASE_URL='postgresql://…' python3 sync_supabase.py --solo grafo|eventos
```

- Nodes/edges upsert by `external_id` → deterministic uuid5, so re-runs update instead of duplicating; `industries`
  gains `arte` without losing other clusters' tags.
- Programs get structured `eligibility` / `requirements` from `requisitos.extraer` (regex, ES/EN) with the quoted
  sentence for every field in `evidence`; fields it can't read stay absent ("a confirmar" in the UI).
- Events are venue Instagram posts announcing openings/exhibitions in the last 75 days (date = post date).
- Refresh: graph and events, re-run the escena-arte steps on the Mac (enrich, prensa…) then this sync. Programs refresh
  on the VPS ("Scheduled run" below).

## Where calls come from

The steps, in the order they must run (each is idempotent). The VPS runs them through `semanal.sh` ("Scheduled run"
below); on the Mac they only feed the local database, since its sync refuses to write programs to a remote one:

```bash
cd /root/projects/escena-arte      # on the VPS; use .venv/bin/python3 there
python3 programas.py            # City of Buenos Aires monthly "Oportunidades" PDFs placed in raw/
python3 programas_curados.py    # curated list L + OVERRIDES; rewrites every curated row
python3 artealdia_calls.py      # Arte al Día news
python3 fuentes.py              # listing sites with real deadlines (below)
python3 convocatorias_ig.py     # open calls announced on Instagram; must run after programas_curados.py
python3 sync_supabase.py --solo programas
```

| Source | Script | What is kept |
| --- | --- | --- |
| Curated list | `programas_curados.py` | Reference programs, each with its official page and usual window (`ventana`). `OVERRIDES` holds dates read by hand from the official page or post. |
| Res Artis open calls | `fuentes.py resartis` | Residencies whose "Fees and support" field says the artist is paid, pays nothing, or pays a low fee (see "What a residency costs"). |
| Artist Communities Alliance | `fuentes.py aca` | Open calls whose listing says "Open to artists based anywhere in the world", ticks a visual discipline, and states a stipend, a zero fee or a low fee in its own number fields. |
| Rivet | `fuentes.py rivet` | Calls with a deadline, housing and "residen…" in the text (the site also lists prizes and magazines), tagged "With Funding" or "Free / No Costs", or with a low program fee. |
| On the Move deadlines | `fuentes.py onthemove` | Visual-arts calls whose text says they are open beyond Europe (worldwide, international artists, Latin America…) and names no residence requirement. Funding is On the Move's own criterion, not checked. |
| Recursos Culturales | `fuentes.py recursos` | Posts tagged visual arts or photography with a stated deadline; only prizes, grants, residencies and biennials, one per organiser site (host of the post's first outbound link). Generic "open calls" there are mostly pay-to-show and are dropped. |
| Instagram of spaces in the map | `convocatorias_ig.py [max accounts=300] [--dry]` | Posts from the last 60 days that announce an open call with a closing date ahead. A post naming a curated program (its distinctive word, e.g. "manglar") updates that program; any other becomes its own row linking to the post. Paid HikerAPI requests: the posts of each account (cached 3 days) and its profile (cached 60 days), so up to two per account and none on a re-run within 3 days. |

Rules for these sources (`ra-`, `aca-`, `rv-`, `otm-`, `rc-`, `ig-` rows):

- Only calls with a stated closing date still ahead are stored, and each row keeps the listing URL in `source`.
- Eligibility is what the text suggests, not a verified rule: Res Artis, ACA, Rivet and On the Move rows say "confirmá en las
  bases"; Recursos Culturales rows get "sí (Argentina / Iberoamérica / internacional)" or "verificar" from keywords
  in the post; Instagram rows are marked "sí (Argentina)" because the accounts read are spaces in the map, nearly all in Buenos Aires.
- Each run rebuilds a site's rows from that day's listing (skipped when the site did not answer), and the Instagram
  reader drops its rows once their date passes. `sync_supabase.py` then deletes from Supabase the `aad-`, `ra-`,
  `aca-`, `rv-`, `otm-`, `rc-` and `ig-` rows that are no longer in the pipeline's table, unless an artist applied. Arte al Día
  rows (`aad-`) are kept with their past date after closing and read as closed. Curated rows are never deleted.

### What a residency costs (`cost`)

`arte_programs.cost` is set only when the listing or the program's own page states it:

- `funded`: the artist is paid or travel is covered (stipend, grant, "fully funded"). A small stipend with travel at
  the artist's expense also counts, so the card quotes the listing's own words in `benefit`.
- `free`: no residency fee.
- `low`: a stated fee of up to `BARATO` (USD 800 a month, about a room's rent). For free-text fees (`mensual` in
  `fuentes.py`) it is the first fee the text states, scaled by the period named next to it ("per week", "for 2
  weeks") or else by the stay's stated length, at rough fixed exchange rates. Fees in currencies it does not read
  (AR$, AUD, THB…) are not classified.

Residencies from the three listing sites that cost more, or do not say, are **not stored**: a stay at €2,000 a month
is not an opportunity for an emerging artist. Curated residencies get their label from `COSTO` in
`programas_curados.py`, quoted from the program's page. In the app: a pill on the card, the "Sin costo o con apoyo"
filter (funded or free), and up to +5 in the score.

`sync_supabase.py` always writes `cost`, so the migration `20261111000002_arte_program_cost.sql` must be applied to a
database before the next programs sync against it (production: applied 2026-11-11).

The reading is a heuristic over listing text. Known misses: a waived fee for one group read as free for all; a grant
described in German or French read as a fee; virtual programmes are skipped by title only.

### Scheduled run (on the VPS)

The programs pipeline runs on the owner's VPS, not on a laptop: ssh alias `personal-vps` (the same Hostinger machine
that runs the backend containers, see CLAUDE.md), folder `/root/projects/escena-arte`, with its own copy of `arte.db`
(the live one for programs), a Python venv in `.venv/`, and the production database URL in
`/root/secrets/escena-arte.env` (root-only; never print it). Root's crontab runs `semanal.sh` on Mondays and Thursdays
at 12:17 UTC (09:17 in Buenos Aires). The LaunchAgent that ran it on the Mac (`com.arte.convocatorias-semanal`) was
removed on 2026-11-11.

`semanal.sh` reads Arte al Día and the listing sites (`fuentes.py`), then syncs programs to production. It prints
nothing: the result is in `logs/semanal-YYYY-MM-DD.log` (date in Buenos Aires time; same-day runs append; logs are
deleted after 120 days). If any script it runs exits with an error, or the calls with a deadline ahead drop by more
than half, it restores `arte.db` from the copy taken at the start of the run (`logs/arte-antes.db`) and does not sync.
A run that passes also deletes page-cache files older than 75 days.

| Task | Scheduled? | How it runs |
| --- | --- | --- |
| Listing sites + Arte al Día + sync | Yes, Mon and Thu | `semanal.sh` from cron |
| Curated list (`programas_curados.py`) | No: hand-verified | Edit on the Mac, then `./deploy_vps.sh curados` |
| Instagram open calls (`convocatorias_ig.py`) | No: paid requests, and the VPS has no `HIKERAPI_KEY` | `semanal.sh ig` once the key is in the secrets file |
| City "Oportunidades" PDFs (`programas.py`) | No: the monthly PDF is found by hand | Copy the PDF to `raw/` on the VPS, run `.venv/bin/python3 programas.py` from the project folder (it needs `pdftotext`, installed there); the rows reach production on the next run |
| Scene graph and events (`--solo grafo`, `--solo eventos`) | No | Crawlers are run by hand on the Mac, whose `arte.db` holds the graph |

`curados` and `ig` are not single steps: each does a full run with that step added, and syncs production.
`--sin-sync` skips the sync but still rewrites the VPS's `arte.db` and its start-of-run copy.

Known limits:

- The VPS's `arte.db` also holds a copy of the scene graph taken on 2026-11-11, and the programs run reads it (alumni
  links in the sync, the accounts the Instagram reader visits). Nothing refreshes that copy: spaces mapped later on
  the Mac do not reach it until `arte.db` is copied over by hand, which would also replace the VPS's programs table.
- The live programs table exists only on the VPS; its only backup is the start-of-run copy from the previous run.
- The Mac keeps the code and an older `arte.db`. A marker file there (`PROGRAMAS_EN_VPS`) makes `sync_supabase.py`
  skip programs when `ARTE_DATABASE_URL` points anywhere but `127.0.0.1`: it prints a line saying so and exits 0, and
  with no `--solo` it still syncs graph and events. A stale copy would otherwise delete the VPS's rows in production.
- Code goes up with `./deploy_vps.sh` (rsync without `--delete`; it never copies the database or `raw/`, and installs
  no packages: the venv was built by hand with scrapling[fetchers], curl_cffi, psycopg2-binary, pypdf, requests).
- Nothing notifies anyone when a run fails: the log and the cards' "verificado" date are the only signals.

```bash
ssh personal-vps 'cd /root/projects/escena-arte/logs && tail -20 "$(ls -t semanal-*.log | head -1)"'   # last run
ssh personal-vps '/root/projects/escena-arte/semanal.sh'              # full run now (sources + production sync)
ssh personal-vps '/root/projects/escena-arte/semanal.sh --sin-sync'   # read sources only
ssh personal-vps 'crontab -l | grep semanal.sh'                       # the schedule
```

### The usual window (`window_text`)

For yearly calls the app reads months from `ventana` (`nextWindow` in `frontend/lib/arte/dates.ts`): the text is split
on `;` and `(`, and it takes the first range of months (or else the first month) in the part that talks about
applying (convocatoria, inscripción, postulación, cierre, abre…), or failing that in a part that is not about
something else (inicio, selección, resultados, finalistas…). Within 90 days of that window, or inside it with no
announced date, the call is shown as upcoming and marked as an estimate. Texts with "bienal" or "trienal" are never
projected.

So `ventana` must name the months **applications are open**, in a part that says so: "anual; convocatoria ~nov–dic".
A `ventana` that only names when selection or the program happens ("anual; selección feb–mar", Manglar's until
2026-11-11) gives no estimate, and the call stays under "para agendar" while it is open.

## Arte al Día open calls (news articles)

`artealdia_calls.py` reads news articles, not call pages, so dates in the text are often a residency period or an
event, not a deadline. Each article prints its own status under the headline (`<published date> Open|Closed`), and
the script trusts that:

- **Open**: the first future date near call/deadline words is the deadline; with none, the call is listed "fecha a confirmar".
- **Closed**, or no marker: the call keeps a past date, so the app reads it as closed and stops listing it. Before
  this rule, ~180 old articles showed up as "recurrente" and a few closed calls as open.
- Calls for galleries (not artists) are skipped.
- `sync_supabase.py` cleans the headlines into program names (deletion of rows that left the pipeline: see the
  rules above).

`programas.py` pins `HOY` to the day the curated list was verified; the news script uses the real date.

**The escena-arte pipeline is not under version control** (the code is edited in `/Users/Macbook/artme/escena-arte`
and deployed to the VPS by rsync; the live programs database exists only on the VPS).
Changes to it are not reviewable or recoverable from this repo.

## Syncing production

Programs are synced by the VPS ("Scheduled run" above). From the Mac only the graph and events are, with production's
database URL read from the Vercel project (see CLAUDE.md, "Production database access"):

```bash
cd /tmp && rm -rf ivprod && mkdir ivprod && cd ivprod \
  && vercel link --yes --scope darolas-projects --project green-panorama-ar \
  && vercel env pull .env.prod --environment=production --yes; \
  U="$(grep '^POSTGRES_URL_NON_POOLING=' .env.prod 2>/dev/null | cut -d= -f2- | tr -d '"')"; cd /tmp && rm -rf ivprod; \
  if [ -n "$U" ]; then (cd /Users/Macbook/artme/escena-arte && ARTE_DATABASE_URL="$U" python3 sync_supabase.py --solo grafo); \
  else echo "no production URL: nothing was synced"; fi; unset U
```

Two things this command is careful about: it only syncs when the production URL was actually read (without it,
`sync_supabase.py` falls back to the **local** database and prints the same success line), and the URL is passed to
that one run instead of being exported, so a later plain `python3 sync_supabase.py` still goes to local.

