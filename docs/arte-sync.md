# Arte data sync

The Arte cluster's public data (graph, programs, recent shows) is produced by the escena-arte pipeline (Python +
SQLite) and loaded into Supabase with one idempotent script. Supabase is the database the app reads. The pipeline
runs on the VPS, and its `arte.db` there is the only live working copy ("Scheduled run" below).

```bash
# on the VPS. semanal.sh loads the secrets file itself; a script run by hand needs it loaded first, or the sync
# goes to a local database and the Instagram and Claude steps have no key:
ssh personal-vps 'cd /root/projects/escena-arte && set -a && . /root/secrets/escena-arte.env && set +a \
  && .venv/bin/python3 sync_supabase.py --solo eventos'      # or grafo, programas; no --solo syncs all three
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
python3 programas_curados.py    # curated list L + OVERRIDES; rewrites every curated row (by hand, after editing the list)
python3 artealdia_calls.py      # Arte al Día news
python3 fuentes.py              # listing sites with real deadlines (below)
python3 verificar_curados.py    # Claude re-reads the curated programmes' pages; must run after programas_curados.py
python3 oportunidades_pdf.py    # finds the city's monthly "Oportunidades" PDF at its known addresses, loads it with programas.py
python3 convocatorias_ig.py     # open calls announced on Instagram; must run after programas_curados.py. Either
                                # order with verificar_curados.py works: a deadline announced on Instagram is protected
python3 sync_supabase.py --solo programas
```

| Source | Script | What is kept |
| --- | --- | --- |
| Curated list | `programas_curados.py` | Reference programs, each with its official page and usual window (`ventana`). `OVERRIDES` holds dates read by hand from the official page or post. Since 2026-11-11 `verificar_curados.py` re-reads the dates from the official pages on every run ("Steps that use Claude"). |
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
(scene graph, programs), the page and Instagram cache in `raw/cache`, a Python venv in `.venv/`, and three secrets in
`/root/secrets/escena-arte.env` (root-only; never print them): the production database URL (`ARTE_DATABASE_URL`), the
HikerAPI key (`HIKERAPI_KEY`) and the Anthropic key (`ANTHROPIC_API_KEY`, see "Steps that use Claude"). Root's crontab
runs `semanal.sh ig` on Mondays and `semanal.sh` on Thursdays, both at 12:17 UTC (09:17 in Buenos Aires), and
`vigia.sh` three hours later on both days.

The pipeline's code lives in its own private repository, `DanteDia/escena-arte` (since 2026-11-11). It still reaches
the VPS by rsync from a checkout (`./deploy_vps.sh`), not by a pull on the server, so what runs there is whatever was
last deployed: deploy from `main`.

| Task | Scheduled? | How it runs |
| --- | --- | --- |
| Listing sites + Arte al Día, sync programs | Yes, Mon and Thu | `semanal.sh` from cron |
| Instagram open calls (`convocatorias_ig.py`) | Yes, Mon | `semanal.sh ig`: the 300 most-followed spaces with a handle, one paid request each for their latest posts |
| Recent shows and the artists each space shows (`enrich.py ig1`, then `calidad.py`), sync graph and events | Yes, Mon | Same run, from the same posts (latest page only). People already in the map are linked (`expuso_en`, `curo` when the caption says they curated it, `etiquetado_en` for a tag). Someone met for the first time, named in a caption as `Name (@handle)` or only tagged, enters when Claude judges them an artist or curator of that show. Events are read from those links |
| Dates of the curated list (`verificar_curados.py`) | Yes, Mon and Thu | Claude reads each programme's official pages and the row takes the opening day and deadline they state |
| Entries of the curated list (`programas_curados.py`): which programmes, their address, benefit, usual window | No: chosen by hand | Edit it in a checkout of the pipeline repo, then `./deploy_vps.sh curados` |
| City "Oportunidades" PDF (`oportunidades_pdf.py`, loaded by `programas.py`) | Yes, Mon and Thu | Looks for last month's and this month's edition (from the 20th, next month's) until each is loaded |
| Did today's run end? (`vigia.sh`) | Yes, Mon and Thu, three hours after the run starts | Alerts when the day's log is missing, when its last run neither ended nor reported its own failure, or when that run's own alert was not delivered |
| The crawlers that built the map (arteBA, Cancillería, Meridiano, Wikidata, venue websites, press, bios, artist profiles) | No: one-off passes, some of them paid | By hand on the VPS when the map needs widening, with the secrets loaded and no run in progress, then `calidad.py`; the next Monday run syncs the result |

`semanal.sh` prints nothing: the result is in `logs/semanal-YYYY-MM-DD.log` (date in Buenos Aires time; same-day runs
append; logs are deleted after 120 days). `curados` and `ig` are not single steps: each does a full run with those
steps added, and syncs production (programs only, or programs, graph and events on an `ig` run). `--sin-sync` skips
the sync but still rewrites `arte.db`.

When a run does not finish, it sends a warning through the server's alert script (`/root/scripts/pango-alert.sh`,
Telegram) that says which of these happened:

- **A reading failed**: a script exited with an error, a count could not be read, the calls with a deadline ahead
  dropped by more than half, or the map lost more than 5% of its nodes. `arte.db` is restored from the copy taken at
  the start of the run (`logs/arte-antes.db`) and nothing is synced. The Instagram reader exits with an error when
  fewer than half of its accounts returned their posts, which is what a dead key or an empty HikerAPI balance looks
  like once the 3-day cache of posts has expired.
- **The run was interrupted** (a signal, a script error) before the sync: same restore, same alert. A hard kill or a
  power loss cannot be caught: the next run starts from whatever `arte.db` held, which every step rebuilds anyway.
- **The sync failed**: `arte.db` is kept, and production may be half-updated, because programs, graph and events are
  committed one after the other. Run it again; the sync is idempotent.
- **Another run was still going**: the new one does not start. If nobody launched one by hand, it is hung.

Two steps are extras: `verificar_curados.py` and `oportunidades_pdf.py`. When either exits with an error (for the
first: a rejected key, no credit, the API down), or when the check of new accounts ran without Claude, the run goes
on, syncs, and then sends a warning naming the step. The warning's text asks about the Anthropic key even when the
step named is `oportunidades_pdf.py`, which uses none. After a synced run, `semanal.sh` also sends two kinds of notice (severity `info`): the deadlines that
changed in the curated list, and, from the 15th, that the month's "Oportunidades" PDF has not appeared.

### City "Oportunidades" PDF

`oportunidades_pdf.py` makes no paid request. It tries the addresses past editions had
(`static.buenosaires.gob.ar/sites/default/files/<upload month>/Oportunidades … .pdf`, uploaded the month before or
the same month, under a handful of names). A file is downloaded only from `buenosaires.gob.ar` and loaded only when
its first two pages name that month and year. An edition counts as loaded when its file is in `raw/` and its entries
are in `arte.db`; a file left behind by a restored run is loaded again. From the 15th, this month's edition still
missing is a notice (last month's and next month's never are). Then either add the new file name to `directas()` in
`oportunidades_pdf.py`, or put the PDF in `raw/` with "oportunidades", the month and the year in its name: the next
run loads it. A file in `raw/` from which no entry could be read is also a notice, on any day. A fallback that asked Claude to search the city's site ran on
2026-11-11 and 12, never found an edition the addresses had missed, and was removed.

### Steps that use Claude

The owner's rule for the Anthropic key (2026-11-12): it is for scheduled, recurring steps whose prompt and rules were
already settled by hand. Research, one-off searches and trial runs are not done with it, and no scheduled step uses
the API's web search. Rehearse a change in a copy of the folder that holds `arte.db`, `raw/ia.db` and `raw/cache`
(the paths are fixed next to the code). Answers are reused only for programmes whose fetched texts are identical;
anything else is a paid request. A change to the instructions has no effect on programmes already read unless
`VERSION` is bumped in `verificar_curados.py`, which re-reads every programme once; so does a change of `ARTE_MODELO`.

Two steps call the Anthropic API through the official SDK (`ia.py`; model `claude-opus-5-5`, or the one named in
`ARTE_MODELO`), and each run prints its token use and an estimated cost in the log. What was already asked is kept in
`raw/ia.db`, apart from `arte.db`, so a failed run that restores the database does not pay for the same answers again.

- **Curated dates** (`verificar_curados.py`). For each curated programme it fetches the official page, up to four
  links of the same site that look like the call page, and up to two PDFs of the same site whose address reads like
  the call's rules ("bases", "reglamento"…), because many Argentine prizes state their dates only there (Premio
  Klemm). Links are found whether or not the `href` is quoted. It asks what those texts state about the current or
  next call. The answer is used only when the sentence it quotes is literally in a fetched text and contains the
  deadline's day number, clock times aside ("hasta las 23.59 h del 4/09" backs day 4, not 23). It is dropped when a
  date does not parse or is more than 800 days away, when the call is restricted to residents or nationals of
  another country (a call limited to one Argentine province or city is kept; the summary says the limit), or when it
  belongs to another programme of the same organiser. A deadline read by hand (`OVERRIDES` in `programas_curados.py`) or announced on Instagram
  (`convocatorias_ig.py`) is never replaced by an older edition or by a page without dates, and a hand-written note
  stays while its date does. A past deadline is kept when the page only announces the next call. A date that only
  the regexes of `programas_curados.py` picked is dropped when the pages describe the call without a deadline; when
  they say nothing about applying, or the call is another programme's or closed to artists in Argentina, it is
  dropped if it is still ahead and the row is not protected. The row's description becomes "Leído en la página: …"
  or "Leído en las bases (PDF): …" with the quoted sentence; when the quote comes from the PDF the card's link stays
  where it was, never on the PDF. When the row's usual window (`frecuencia` in `arte.db`) is a bare "anual", the row
  is not protected, and the reading gave an opening day and a deadline at most 200 days apart, the window becomes
  "anual; convocatoria ~jun–sep (según la edición 2026)", which the app can project. Rules PDFs are read with the
  system's `pdftotext` (first 40 pages, up to 15 MB); one that cannot be read is skipped and counted in the log
  line "PDF de bases que no se pudieron leer", which is how a programme silently loses its dates. A programme none
  of whose texts changed since the last reading is not sent again (`ia_curados` in `raw/ia.db`); its last answer is
  re-applied, which also restores the dates after a by-hand run of `programas_curados.py`. When one text changes,
  all of that programme's texts are sent. A full first reading of the 75 programmes costs USD 3 to 4 (estimated from
  the readings of 2026-11-11 and 12: about USD 2.90 for 59 programmes); later runs only pay for the programmes where
  some text changed. After five answers lost in a row the step stops with an error.
- **New artists** (`revisar` in `enrich.py`, weekly pass only). The accounts the pass meets for the first time are
  sent in batches with the caption they appeared in. An account already in the map under another name is linked
  without asking; an account judged in the last 90 days is not asked about again (`ia_cuentas` in `raw/ia.db`). The
  log lists who was approved and who was discarded. Without Claude (no key, an error) the pass does what it did
  before, a caption that names someone adds them and a tag alone adds nobody, and the run ends with a warning. On
  2026-11-11 it approved 84 of 403 new accounts.

The first run of each day also keeps a dated copy of the database, `logs/arte-YYYY-MM-DD.db`, deleted after 35 days by
a later passing run, which also deletes cache files older than 75 days. To go back to one, with no run in progress:
`cp logs/arte-YYYY-MM-DD.db arte.db`, then a run. A deliberate cleanup that removes more than 5% of the map has to be
done by hand (`calidad.py`, with the secrets loaded) before a run, because inside a run it trips the guard.

Known limits:

- The sync upserts nodes, edges and events and never deletes them: something `calidad.py` or `dedupe.py` removes
  from `arte.db` stays in Supabase until someone deletes it there.
- Spaces beyond the 300 most-followed get their posts re-read only when the 60-day cache expires, and only the latest
  page of posts is read each week, so a space that posts more than a page a week loses the older ones.
- New artists are a model's judgment over a name and a caption. It errs towards leaving people out: real artists it
  could not tell from the caption are discarded and not reconsidered for 90 days. Artists added before 2026-11-11
  were never reviewed this way, so a few are not people ("Los Vencedores"). The by-hand pass (`enrich.py ig`) still
  adds every tagged account as an artist, about one non-artist in four: review its result before a synced run.
- Curated programmes whose site does not answer from the VPS are not re-read (three on 2026-11-12: Premio Itaú, HISK
  and FLORA), nor is one whose only address is an Instagram profile (Beca Constelaciones); each run's log lists them
  under "sin página". And about half of the pages say nothing about applying,
  so those rows keep their hand-read dates or none. Programmes announced only on Instagram (Manglar) still depend on
  `OVERRIDES`.
- Many curated addresses are the page of one edition (ten on 2026-11-12, named in the comment above `L` in
  `programas_curados.py`; seven of them among the ten programmes added that day): each has to be replaced by hand
  when the next edition gets its own page, and nothing warns when one goes stale.
- The same programme can exist twice, once curated and once from another source under a longer name (Premio Klemm
  and the entry of the city's "Oportunidades" PDF, "Premio Federico Jorge Klemm a las Artes Visuales"): nothing merges them.
- The regexes of `programas_curados.py` only recognise dates in 2026 and 2027.
- A venue's Instagram handle is whatever a crawler found. `calidad.py` removes a directory's or the city's account
  from the venues it was pinned on (`web.NO_IG`; the directory's own node keeps it, `DUENOS`) and the handles read by
  hand as someone else's (`IG_MAL`), with the artist links learned from that account's posts. Venue-to-venue links
  (`colabora_con`) from those posts are not removed, and a wrong handle in neither list is read as the venue's own.
- Events are only the announcements that link at least one artist: one already in the map, or one the run added
  from that post.
- If cron itself stops running, or the server is down, nothing alerts: `semanal.sh` and `vigia.sh` both live there.
- The dated copies live on the same disk as the database.
- Only the VPS folder can write to a remote database: `sync_supabase.py` refuses unless the file
  `ESTA_ES_LA_BASE_VIVA` sits next to it, and `deploy_vps.sh` never copies that file. Do not copy it by hand: any
  other folder (the owner's Mac has the code and an old `arte.db`) would then overwrite production with stale data.
- Code goes up with `./deploy_vps.sh` (rsync without `--delete`; it never copies the database or `raw/`, and installs
  no packages: the venv was built by hand with scrapling[fetchers], curl_cffi, psycopg2-binary, pypdf, requests,
  anthropic; `requirements.txt` in the pipeline repo lists them. The system package `poppler-utils` gives `pdftotext`).

```bash
ssh personal-vps 'cd /root/projects/escena-arte/logs && tail -20 "$(ls -t semanal-*.log | head -1)"'   # last run
ssh personal-vps '/root/projects/escena-arte/semanal.sh'              # Thursday's run now (listing sites, sync programs)
ssh personal-vps '/root/projects/escena-arte/semanal.sh ig'           # Monday's run now (adds Instagram; paid HikerAPI requests)
ssh personal-vps '/root/projects/escena-arte/semanal.sh --sin-sync'   # read sources only, no sync
# every one of these also runs the Claude steps, which are paid when a page or rules PDF changed or a new account appears
ssh personal-vps 'crontab -l | grep escena-arte'                      # the schedule
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


## Syncing production

Only the VPS syncs production, at the end of each scheduled run or by hand with the command at the top of this page. Before the first
sync after a schema change, apply the migration to production (see CLAUDE.md, "Production database access").
`sync_supabase.py` falls back to the **local** database when `ARTE_DATABASE_URL` is not set and prints the same
success line, which is why `semanal.sh` stops with an alert when the variable is missing. With no `--solo` it syncs
everything; any other argument (`--help`, a misspelt section) prints the usage and exits without syncing.

