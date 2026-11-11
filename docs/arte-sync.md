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

## Where calls come from

Run in this order (each step is idempotent), then sync programs:

```bash
cd /Users/Macbook/artme/escena-arte
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
| Res Artis open calls | `fuentes.py resartis` | Residencies whose "Fees and support" text mentions support (stipend, fully funded, no fee, a travel or materials grant…) and no cost to the artist. A heuristic on the listing text: partial support passes. Most listings there are pay-to-stay and are dropped. |
| On the Move deadlines | `fuentes.py onthemove` | Visual-arts calls whose text says they are open beyond Europe (worldwide, international artists, Latin America…) and names no residence requirement. Funding is On the Move's own criterion, not checked. |
| Recursos Culturales | `fuentes.py recursos` | Posts tagged visual arts or photography with a stated deadline; only prizes, grants, residencies and biennials, one per organiser site (host of the post's first outbound link). Generic "open calls" there are mostly pay-to-show and are dropped. |
| Instagram of spaces in the map | `convocatorias_ig.py [max accounts=300] [--dry]` | Posts from the last 60 days that announce an open call with a closing date ahead. A post naming a curated program (its distinctive word, e.g. "manglar") updates that program; any other becomes its own row linking to the post. Paid HikerAPI requests: the posts of each account (cached 3 days) and its profile (cached 60 days), so up to two per account and none on a re-run within 3 days. |

Rules for these four sources (`ra-`, `otm-`, `rc-`, `ig-` rows):

- Only calls with a stated closing date still ahead are stored, and each row keeps the listing URL in `source`.
- Eligibility is what the text suggests, not a verified rule: Res Artis and On the Move rows say "confirmá en las
  bases"; Recursos Culturales rows get "sí (Argentina / Iberoamérica / internacional)" or "verificar" from keywords
  in the post; Instagram rows are marked "sí (Argentina)" because the accounts are Argentine spaces.
- Each run rebuilds a site's rows from that day's listing (skipped when the site did not answer), and the Instagram
  reader drops its rows once their date passes. `sync_supabase.py` then deletes from Supabase the `aad-`, `ra-`,
  `otm-`, `rc-` and `ig-` rows that are no longer in the pipeline's table, unless an artist applied. Arte al Día
  rows (`aad-`) are kept with their past date after closing and read as closed. Curated rows are never deleted.

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

