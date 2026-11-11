# Arte data sync

The Arte cluster's public data (graph, programs, recent shows) is produced by the escena-arte pipeline (Python +
SQLite) and loaded into Supabase with one idempotent script. Supabase is the database the app reads. The pipeline
runs on the VPS, and its `arte.db` there is the only live working copy ("Scheduled run" below).

```bash
# on the VPS (ssh personal-vps), normally through semanal.sh, which loads the secrets file:
cd /root/projects/escena-arte && .venv/bin/python3 sync_supabase.py [--solo grafo|programas|eventos]   # needs ARTE_DATABASE_URL
# on a dev machine, against local Supabase (frontend/supabase, ports 544xx):
python3 sync_supabase.py
```

- Nodes/edges upsert by `external_id` → deterministic uuid5, so re-runs update instead of duplicating; `industries`
  gains `arte` without losing other clusters' tags.
- Programs get structured `eligibility` / `requirements` from `requisitos.extraer` (regex, ES/EN) with the quoted
  sentence for every field in `evidence`; fields it can't read stay absent ("a confirmar" in the UI).
- Events are venue Instagram posts announcing openings/exhibitions in the last 75 days (date = post date). They are
  the posts that link an artist to a venue (`edges` rows written by `enrich.py`), read back from the Instagram cache
  in `raw/cache`, so an event needs both the link and the cached post.
- Refresh: everything refreshes on the VPS on a schedule ("Scheduled run" below).

## Where calls come from

The steps, in the order they must run (each is idempotent). The VPS runs them through `semanal.sh` ("Scheduled run"
below); on any other machine they only feed that machine's local database:

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

The whole pipeline runs on the owner's VPS, not on a laptop: ssh alias `personal-vps` (the same Hostinger machine
that runs the backend containers, see CLAUDE.md), folder `/root/projects/escena-arte`, with the only live `arte.db`
(scene graph, programs), the page and Instagram cache in `raw/cache`, a Python venv in `.venv/`, and two secrets in
`/root/secrets/escena-arte.env` (root-only; never print them): the production database URL (`ARTE_DATABASE_URL`) and
the HikerAPI key (`HIKERAPI_KEY`). Root's crontab runs `semanal.sh ig` on Mondays and `semanal.sh` on Thursdays, both
at 12:17 UTC (09:17 in Buenos Aires).

| Task | Scheduled? | How it runs |
| --- | --- | --- |
| Listing sites + Arte al Día, sync programs | Yes, Mon and Thu | `semanal.sh` from cron |
| Instagram open calls (`convocatorias_ig.py`) | Yes, Mon | `semanal.sh ig`: the 300 most-followed spaces with a handle, one paid request each for their latest posts |
| Recent shows and the artists each space shows (`enrich.py ig1`, then `calidad.py`), sync graph and events | Yes, Mon | Same run, from the same posts (latest page only). A show announcement that names someone as `Name (@handle)` adds that artist and an `expuso_en` link; a tag only links people already in the map (`etiquetado_en`), it never adds anyone. Events are read from those links |
| Curated list (`programas_curados.py`) | No: hand-verified | Edit it, then `./deploy_vps.sh curados` |
| City "Oportunidades" PDFs (`programas.py`) | No: the monthly PDF is found by hand | Copy the PDF to `raw/` on the VPS, run `.venv/bin/python3 programas.py` from the project folder (it needs `pdftotext`, installed there); the rows reach production on the next run |
| The crawlers that built the map (arteBA, Cancillería, Meridiano, Wikidata, venue websites, press, bios, artist profiles) | No: one-off passes, some of them paid | By hand on the VPS when the map needs widening, then `calidad.py`; the next Monday run syncs the result |

`semanal.sh` prints nothing: the result is in `logs/semanal-YYYY-MM-DD.log` (date in Buenos Aires time; same-day runs
append; logs are deleted after 120 days). `curados` and `ig` are not single steps: each does a full run with those
steps added, and syncs production (programs only, or programs, graph and events on an `ig` run). `--sin-sync` skips
the sync but still rewrites `arte.db`.

When a run fails: if any script exits with an error, the calls with a deadline ahead drop by more than half, or the
map loses more than 5% of its nodes, the run restores `arte.db` from the copy taken at its start, syncs nothing and
sends a warning through the server's alert script (`/root/scripts/pango-alert.sh`, Telegram). The Instagram reader
exits with an error when it could read fewer than half of its accounts (a dead key or an empty HikerAPI balance), so
that case alerts too. Each run also keeps a dated copy of the database, `logs/arte-YYYY-MM-DD.db`, for 35 days, and a
run that passes deletes cache files older than 75 days.

Known limits:

- The sync upserts nodes and edges and never deletes them: something `calidad.py` or `dedupe.py` removes from
  `arte.db` stays in Supabase.
- Spaces beyond the 300 most-followed get their posts re-read only when the 60-day cache expires, and only the latest
  page of posts is read each week, so a space that posts more than a page a week loses the older ones.
- New artists come from a name pattern in captions, so a few are not people ("Los Vencedores"); `calidad.py` drops
  names that do not look like a person, nothing else reviews them. The by-hand pass (`enrich.py ig`) also adds tagged
  accounts as artists, which on 2026-11-11 was about one non-artist in four: review its result before a synced run.
- A venue's Instagram handle is whatever a crawler found. `calidad.py` removes a directory's or the city's account
  from the venues it was pinned on (`web.NO_IG`, `IG_MAL`), with every link learned from that account's posts; a
  wrong handle that is not in those lists is read as the venue's own.
- Events are only the announcements that link at least one artist already in the map or named in the caption.
- If cron itself stops running, nothing alerts: the alert comes from the script.
- The dated copies live on the same disk as the database.
- Any other machine holding the code (the owner's Mac has it, with an old `arte.db`) carries a marker file,
  `BASE_VIVA_EN_VPS`, that makes `sync_supabase.py` refuse to write to anything but a local database.
- Code goes up with `./deploy_vps.sh` (rsync without `--delete`; it never copies the database or `raw/`, and installs
  no packages: the venv was built by hand with scrapling[fetchers], curl_cffi, psycopg2-binary, pypdf, requests).

```bash
ssh personal-vps 'cd /root/projects/escena-arte/logs && tail -20 "$(ls -t semanal-*.log | head -1)"'   # last run
ssh personal-vps '/root/projects/escena-arte/semanal.sh'              # Thursday's run now (listing sites, sync programs)
ssh personal-vps '/root/projects/escena-arte/semanal.sh ig'           # Monday's run now (adds Instagram; paid requests)
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

**The escena-arte pipeline is not under version control** (the code is edited on the owner's Mac in
`/Users/Macbook/artme/escena-arte` and deployed to the VPS by rsync). Changes to it are not reviewable or recoverable
from this repo.

## Syncing production

Only the VPS syncs production, at the end of each scheduled run or by hand with the commands above. Before the first
sync after a schema change, apply the migration to production (see CLAUDE.md, "Production database access").
`sync_supabase.py` falls back to the **local** database when `ARTE_DATABASE_URL` is not set and prints the same
success line, which is why `semanal.sh` stops with an alert when the variable is missing. With no `--solo` it syncs
everything; any other argument (`--help`, a misspelt section) prints the usage and exits without syncing.

