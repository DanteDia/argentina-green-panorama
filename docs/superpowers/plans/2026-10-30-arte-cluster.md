# IndustriesVerified · Arte — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (owner's rule: native, in-session) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A logged-in career tool for emerging artists under `/arte` (profile, opportunity radar with reasons, season plan, applications pipeline, dossier PDF, discovery, public portfolio) on top of the escena-arte graph.

**Architecture:** Next.js 16 app router routes under `frontend/app/arte`, domain logic as pure TypeScript in `frontend/lib/arte` (unit-tested with Vitest), Supabase (Postgres + Auth + Storage, local via CLI for dev) with RLS on user-owned `arte_*` tables, graph data in the existing `nodes`/`edges` tagged `industries:['arte']`. The Python escena-arte pipeline stays the offline source; a Python sync script upserts into Postgres.

**Tech Stack:** Next.js 16.2, React 19, Tailwind 4, @supabase/supabase-js + @supabase/ssr, @react-pdf/renderer, sharp, Vitest, Playwright, Python 3.12 + psycopg for sync, OpenRouter (optional), HikerAPI.

**Spec:** `docs/superpowers/specs/2026-10-30-arte-cluster-design.md`

## Global Constraints

- UI copy in Spanish (Rioplatense neutral, voseo allowed in microcopy); code/comments in English.
- Every shown call/date/requirement carries `source` + `verified_at`; unknown renders "a confirmar", never a guess.
- AI features degrade gracefully without `OPENROUTER_API_KEY` (template/rule fallbacks).
- User-owned tables: RLS `user_id = auth.uid()`; public tables read-only to anon.
- Read `frontend/node_modules/next/dist/docs/` before using a Next API you are unsure of (repo rule: "This is NOT the Next.js you know").
- No secrets committed; env vars only (`.env.local` is gitignored).
- Commits: conventional, no AI attribution (owner rule).
- Integration branch `feat/arte-cluster`; never push to `main`; production deploy only with owner approval.

## Review Focus

1. Program with no `closes_at` (recurring/unknown) → listed as "recurrente · ventana típica …", never as open/closed by guess. Test in Task 4.
2. Artist profile almost empty (just signed up) → matching still returns ranked results with reasons that say what is missing, no crash. Test in Task 4.
3. Deadline today / timezone edge (America/Argentina/Buenos_Aires) → "cierra hoy", not "cerrada". Test in Task 4.
4. Dossier for a call whose limits are tight (e.g. max 10 images, ≤10 MB) with a profile of 30 large images → PDF respects both limits (downscale + cap). Test in Task 7.
5. Instagram handle that doesn't exist / private / HikerAPI error → onboarding continues with site + manual entry and shows what failed. Test in Task 5.

## PRs

All PRs target the integration branch `feat/arte-cluster` (not `main`), each from its own branch cut from the freshly merged integration branch, merged in this order before the next one is opened (no stacking). Each stays under ~400 changed lines of hand-written code (migrations/lockfiles excluded).

1. **PR 1 — foundations** (`arte/1-foundations`): Task 1.
2. **PR 2 — data sync** (`arte/2-sync`): Task 2 (Python lives in escena-arte; the PR carries any migration changes and a `docs/arte-sync.md` how-to).
3. **PR 3 — profile** (`arte/3-profile`): Task 3.
4. **PR 4 — matching** (`arte/4-matching`): Task 4.
5. **PR 5 — onboarding** (`arte/5-onboarding`): Task 5.
6. **PR 6 — applications & plan** (`arte/6-applications`): Task 6.
7. **PR 7 — dossier** (`arte/7-dossier`): Task 7.
8. **PR 8 — discovery, portfolio, smoke** (`arte/8-discovery`): Task 8.

Final: `feat/arte-cluster` → `main` only after the owner reviews the Vercel preview.

---

### Task 1: Foundations — Supabase local, schema + RLS, auth, `/arte` shell

**Files:**
- Create: `frontend/supabase/config.toml` (via `supabase init`), `frontend/supabase/migrations/20261030000001_arte.sql`
- Create: `frontend/lib/arte/supabase-server.ts`, `frontend/lib/arte/supabase-browser.ts`, `frontend/lib/arte/types.ts`
- Create: `frontend/app/arte/layout.tsx`, `frontend/app/arte/page.tsx` (landing), `frontend/app/arte/login/page.tsx`, `frontend/app/arte/auth/callback/route.ts`, `frontend/app/arte/(app)/layout.tsx` (auth gate + nav), session refresh per Next 16 docs (proxy/middleware)
- Create: `frontend/vitest.config.ts`; Modify: `frontend/package.json` (scripts `test`, `test:e2e`)
- Test: `frontend/lib/arte/__tests__/schema.test.ts`

**Interfaces:**
- Produces: `createServerSupabase(): Promise<SupabaseClient>` (cookie-bound, user session), `createAdminSupabase(): SupabaseClient` (service role, server only), `requireUser(): Promise<{ user: User; profile: ArteProfile | null }>` (redirects to `/arte/login`).
- Produces tables: `arte_profiles`, `arte_works`, `arte_cv_items`, `arte_texts`, `arte_programs`, `arte_applications`, `arte_application_items`, `arte_alerts`, `arte_follows`, `arte_events`; buckets `arte-private`, `arte-public`. Columns per spec §8; `arte_programs.eligibility jsonb`, `requirements jsonb`, `evidence jsonb` (field → quoted sentence).
- Produces types (`types.ts`): `ArteProfile`, `ArteWork`, `CvItem`, `CvKind = 'education'|'solo'|'group'|'prize'|'grant'|'residency'|'collection'|'press'`, `Program`, `Eligibility`, `Requirements`, `Application`, `AppStatus = 'idea'|'preparing'|'sent'|'selected'|'rejected'|'withdrawn'`.

- [ ] Step 1: `supabase init` in `frontend/`, `supabase start`; write migration; `supabase db reset` succeeds.
- [ ] Step 2: Failing test `schema.test.ts`: two admin-created users; A inserts a work; B's client selecting `arte_works` gets 0 rows; anon can select `arte_programs`, cannot insert.
- [ ] Step 3: Add RLS policies; `npm test -- schema` passes.
- [ ] Step 4: Install `@supabase/ssr`; implement clients, `requireUser`, magic-link login, callback route, `(app)` layout with nav (Hoy, Oportunidades, Plan, Postulaciones, Perfil, Descubrir, Mapa). Manual check: sign in via Inbucket (`http://127.0.0.1:54324`) lands on `/arte/hoy`.
- [ ] Step 5: Design tokens in `app/arte/layout.tsx` (serif display, calm dark palette, one accent). Commit `feat(arte): supabase schema, auth and /arte shell`.

### Task 2: Data sync escena-arte → Supabase

**Files:**
- Create: `/Users/Macbook/artme/escena-arte/sync_supabase.py`, `/Users/Macbook/artme/escena-arte/requisitos.py`, `docs/arte-sync.md`
- Test: `/Users/Macbook/artme/escena-arte/test_requisitos.py`

**Interfaces:**
- Consumes: Task 1 tables; env `ARTE_DATABASE_URL` (local default `postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
- Produces: `requisitos.extraer(texto: str) -> dict` → `{"eligibility": {...}, "requirements": {...}, "evidence": {field: sentence}}`; CLI `python3 sync_supabase.py [--solo programas]` (idempotent upserts by id).

- [ ] Step 1: Failing tests: "Destinado a artistas mayores de 18 años, con nacionalidad argentina" → `age_min == 18`, `nationality == ['AR']`; "residentes en la República Argentina" → `residence == ['AR']`; "hasta 35 años" → `age_max == 35`; "Se solicitan 10 imágenes y un PDF de hasta 10MB" → `images_n == 10`, `pdf_mb_max == 10`; "carta de motivación" → `letter is True`; "costo de inscripción USD 30" → `fee == {"amount": 30, "currency": "USD"}`; each field's sentence in `evidence`.
- [ ] Step 2: Implement `extraer` (regex, ES + EN); `python3 -m pytest test_requisitos.py -q` passes.
- [ ] Step 3: Sync nodes/edges (art), `arte_programs` (`programas` + `extraer`), `arte_events` (venue posts announcing openings with dates, Meridiano agenda), keeping `source`, `verified_at`.
- [ ] Step 4: Run locally; `psql` counts: `arte_programs` ≈ 393, art nodes ≈ 5,800. Commit docs.

### Task 3: Profile, works and CV editor (+ storage)

**Files:**
- Create: `frontend/app/arte/(app)/perfil/page.tsx`, `.../perfil/obras/page.tsx`, `.../perfil/cv/page.tsx`, `.../perfil/actions.ts`, `frontend/components/arte/WorkCard.tsx`, `frontend/components/arte/ImageUpload.tsx`, `frontend/lib/arte/completeness.ts`
- Test: `frontend/lib/arte/__tests__/completeness.test.ts`

**Interfaces:**
- Produces: `completeness(p, works, cv, texts): { score: number; missing: string[] }` (0–100; Spanish labels, e.g. "statement", "bio corta en inglés", "fichas técnicas (3 obras sin medidas)").
- Server actions: `saveProfile`, `upsertWork`, `reorderWorks(ids: string[])`, `deleteWork`, `upsertCvItem`, `saveText(kind: 'bio_short'|'bio_long'|'statement', lang: 'es'|'en', body)`.

- [ ] Step 1: Failing tests (empty → score ≤ 10, missing includes "obras"; full → ≥ 90).
- [ ] Step 2: Implement; tests pass.
- [ ] Step 3: Pages (works grid with order, technical sheet form, upload to `arte-private/{user}/works/`, CV grouped by kind, bios/statement ES/EN, "publicar en portfolio" toggle). Manual: upload, reload, persists. Commit.

### Task 4: Matching engine, Oportunidades and Hoy

**Files:**
- Create: `frontend/lib/arte/eligibility.ts`, `frontend/lib/arte/match.ts`, `frontend/lib/arte/dates.ts`, `frontend/lib/arte/tiers.ts`, `frontend/app/arte/(app)/oportunidades/page.tsx`, `.../oportunidades/[id]/page.tsx`, `frontend/app/arte/(app)/hoy/page.tsx`, `frontend/components/arte/ProgramCard.tsx`
- Test: `frontend/lib/arte/__tests__/match.test.ts`, `frontend/lib/arte/__tests__/dates.test.ts`

**Interfaces:**
- Produces: `checkEligibility(p, prog): { ok: boolean; reasons: string[] }`; `scoreProgram(ctx: MatchContext, prog): { score: number; reasons: string[]; effortDays: number }`, `MatchContext = { profile, works, cv, appliedProgramIds: Set<string>, similarArtistNodeIds: Set<string> }`; `rankPrograms(ctx, programs): Ranked[]`; `programState(prog, now): { label: 'abierta'|'cierra hoy'|'próxima'|'cerrada'|'recurrente'; daysLeft?: number; text: string }` (TZ America/Argentina/Buenos_Aires).
- Weights (tunable): fit 0–40 (discipline 15, digital 10, themes 15), strategic 0–40 (stage-appropriate type 15, tier 15, alumni similarity 10), timing/effort 0–20.

- [ ] Step 1: Failing tests: ineligible age → excluded with reason "edad"; digital artist ranks Hangar Tecnosis above a literature prize; empty profile → results + reason "completá tu statement para afinar"; `closes_at` today 23:59 ART checked 10:00 ART → "cierra hoy"; null `closes_at` + window → "recurrente"; applied program excluded.
- [ ] Step 2: Implement; tests pass.
- [ ] Step 3: Oportunidades (filters estado/tipo/país/digital/"elegibles para mí"; card with score, reasons, countdown, benefit, effort, source + verified date, "Postularme"), detail with requirements + evidence quotes, Hoy (top 3, deadlines this week, shows this week, completeness). Commit.

### Task 5: Onboarding import (website + Instagram + graph match)

**Files:**
- Create: `frontend/lib/arte/hiker.ts`, `frontend/lib/arte/site-import.ts`, `frontend/lib/arte/import-map.ts`, `frontend/app/api/arte/import/route.ts`, `frontend/app/arte/(app)/onboarding/page.tsx`
- Test: `frontend/lib/arte/__tests__/import-map.test.ts`

**Interfaces:**
- Produces: `fetchIgProfile(handle): Promise<IgProfile | { error: string }>`, `fetchIgPosts(userId, pages = 2)`, `fetchIgFollowing(userId, max = 2000)`; `importSite(url): Promise<{ text; images: string[]; pages: string[] }>`; `mapImport({ ig?, site?, graphNode? }): DraftProfile` (fields carry `source`); `POST /api/arte/import { website?, instagram? } → DraftProfile` (stores follows in `arte_follows`). Graph match by IG handle, then normalized name.

- [ ] Step 1: Failing tests: graph edges `expuso_en`/`premiado_en` → CV items `group`/`prize` with years; IG bio email → contact; IG `{error}` → draft from site + warning "No pude leer tu Instagram".
- [ ] Step 2: Implement; tests pass.
- [ ] Step 3: UI: inputs → progress → review (accept/edit/discard) → writes profile/works/cv. Commit.

### Task 6: Applications pipeline + checklist + season plan

**Files:**
- Create: `frontend/lib/arte/checklist.ts`, `frontend/lib/arte/plan.ts`, `frontend/app/arte/(app)/postulaciones/page.tsx`, `.../postulaciones/[id]/page.tsx`, `.../postulaciones/actions.ts`, `frontend/app/arte/(app)/plan/page.tsx`
- Test: `frontend/lib/arte/__tests__/checklist.test.ts`, `frontend/lib/arte/__tests__/plan.test.ts`

**Interfaces:**
- Produces: `buildChecklist(req: Requirements, profileGaps: string[]): ChecklistItem[]` (`{ key, label, done, due_offset_days }`); `seasonPlan(ranked, budgetPerMonth, now): PlanMonth[]` (`{ month: 'YYYY-MM', items: { programId, prepStart, deadline, projected }[] }`); actions `createApplication(programId)`, `setStatus(id, status, result?)` (`selected` creates a CV item).

- [ ] Step 1: Failing tests: `{letter, cv, images_n: 10}` → "Carta de motivación", "CV", "Seleccionar 10 obras con ficha"; budget 2 → never >2 deadlines in a month; recurring programs projected to next window with `projected: true`.
- [ ] Step 2: Implement; tests pass.
- [ ] Step 3: Kanban + detail (checklist, notes, files, result) + 12-month Plan calendar. Commit.

### Task 7: Dossier generator + PDF

**Files:**
- Create: `frontend/lib/arte/llm.ts`, `frontend/lib/arte/dossier.ts`, `frontend/lib/arte/pdf/DossierDocument.tsx`, `frontend/app/api/arte/dossier/[applicationId]/route.ts`, `frontend/app/arte/(app)/postulaciones/[id]/dossier/page.tsx`
- Test: `frontend/lib/arte/__tests__/dossier.test.ts`

**Interfaces:**
- Produces: `complete(prompt, { system, maxTokens }): Promise<string | null>` (null without key); `assembleDossier(ctx): Dossier` (`{ sections: { letter, bio, cv, works: SelectedWork[] }, limits: { images_max?, mb_max?, pages_max? }, fileName }`); `draftLetter(ctx): Promise<{ text: string; usedAI: boolean }>`; PDF route enforces limits (sharp downscale, image cap, file name "Nombre Apellido - postulación a <Programa>.pdf").

- [ ] Step 1: Failing tests: 30 works + `images_n: 10` → 10 selected, ordered by fit to the call text; `pdf_mb_max: 10` → image budget ≤ 9.5 MB; no key → template letter with the artist's statement and 2 real work titles; exact file name.
- [ ] Step 2: Implement; tests pass.
- [ ] Step 3: Editor (editable sections, regenerate letter, preview, export) + PDF templates "editorial" and "minimal". Manual: export a real program, opens in Preview, under limit. Commit.

### Task 8: Discovery, map, public portfolio, user zero, smoke test

**Files:**
- Create: `frontend/lib/arte/discover.ts`, `frontend/app/arte/(app)/descubrir/page.tsx`, `frontend/app/arte/(app)/mapa/page.tsx` (reuse `components/GraphCanvas.tsx`, `industries=arte`), `frontend/app/arte/a/[slug]/page.tsx`, `/Users/Macbook/artme/escena-arte/seed_dante.py`, `frontend/e2e/arte.spec.ts`, `frontend/playwright.config.ts`
- Test: `frontend/lib/arte/__tests__/discover.test.ts`

**Interfaces:**
- Produces: `affineArtists(ctx: { follows: string[], profile, graph }): { nodeId, name, reasons: string[], score }[]` (following ∩ graph first, then shared venues/programs, then theme overlap); `affineVenues(...)` same shape. Seed: `python3 seed_dante.py --email aroladante@gmail.com` imports 21 works from `obras.json` (+ /artme images), Liminales CV item, links graph node.

- [ ] Step 1: Failing tests (followed handle in graph ranks first with "lo seguís en Instagram"; shared gallery adds "comparten galería X").
- [ ] Step 2: Implement; tests pass.
- [ ] Step 3: Descubrir, Mapa (own neighborhood highlighted), public portfolio.
- [ ] Step 4: Playwright smoke: Inbucket login → manual onboarding → opportunity → application → dossier PDF (200, `application/pdf`); `npm run test:e2e` passes.
- [ ] Step 5: Seed Dante; walkthrough; `npm run build` passes; commit; push; Vercel preview (no production promote).
