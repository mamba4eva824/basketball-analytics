# Lakers Analytics — Project Guide

Local-first NBA analytics app focused on the Los Angeles Lakers (team ID `1610612747`).
A Python ETL pulls data from stats.nba.com (via `nba_api`) into Postgres; a Next.js app
reads it through Prisma and renders two primary dashboards in the browser:

| Route        | What it answers                                                              |
|--------------|-------------------------------------------------------------------------------|
| `/`          | How are the Lakers and each player on the new roster performing?             |
| `/matchup`   | Who do we play next, how good are they, and where do we have the edge?       |

Supporting pages: `/standings`, `/roster`, `/games`, `/players/[id]`, `/players/[id]/shots`, `/teams/[id]`.

## Layout

```
CLAUDE.md                     ← you are here (project-wide rules)
.claude/skills/               ← task playbooks (see "Skills" below)
nba-analytics/
  etl/                        ← Python ETL (nba_api → Postgres). config.py owns season + team constants
  prisma/schema.prisma        ← single source of truth for the DB schema (no migrations dir; use db push)
  src/lib/constants.ts        ← single source of truth for focus team + current season (frontend)
  src/lib/analytics/          ← PURE metric functions (ratings, four factors, ranks, projection, roster)
  src/lib/dashboard-types.ts  ← response types for the aggregate dashboard endpoints
  src/app/api/dashboard/…     ← aggregate endpoint for `/`
  src/app/api/matchup/…       ← aggregate endpoint for `/matchup`
  src/components/dashboard/   ← dashboard + matchup UI
  scripts/seed-demo-data.ts   ← synthetic data for UI dev / e2e (NOT real stats)
  scripts/seed-test-data.ts   ← minimal fixtures for the API integration tests
```

`nba-analytics/AGENTS.md` applies too: this is Next.js 16 — read the bundled docs in
`nba-analytics/node_modules/next/dist/docs/` before using an API you are unsure of
(e.g. route `params` are Promises; `useSearchParams` needs a `<Suspense>` boundary).

## Commands (run from `nba-analytics/`)

```bash
npm run dev -- -p 4000                 # app at http://localhost:4000 (tests expect port 4000)
npx prisma db push && npx prisma generate
npx tsx scripts/seed-demo-data.ts      # synthetic data so the UI renders without the ETL
etl-env/bin/python etl/refresh.py      # daily refresh, current season, league-wide (~45 API calls)
etl-env/bin/python etl/run_all.py      # full multi-season backfill (slow, hundreds of calls)

npx tsc --noEmit                       # typecheck
npx eslint <changed files>             # lint (the legacy tree has pre-existing `any` errors)
npx vitest run src/__tests__/lib       # pure unit tests (no server/DB needed)
etl-env/bin/pytest etl/tests/unit -q   # ETL transform unit tests (no network/DB)
# API integration + e2e: these use scripts/seed-test-data.ts, which seeds season 2025-26, so pin it
npx tsx scripts/seed-test-data.ts && NEXT_PUBLIC_NBA_SEASON=2025-26 npm run dev -- -p 4000
npx vitest run                         # all unit + API integration tests
npx playwright test                    # e2e
```

`DATABASE_URL` lives in `nba-analytics/.env` (git-ignored). Default:
`postgresql://postgres:postgres@localhost:5432/nba_analytics`.

## Data rules (non-negotiable)

1. **Never invent or proxy a metric.** If a value is missing, show "—" and say why. Do not
   relabel one stat as another (the old dashboard plotted `PPG − 10` as "+/-"; PIE is not PER).
2. **Percentages are stored as 0–1 decimals**; ratings are per 100 possessions; pace is
   possessions per game (box scores carry no minutes, so it is not per-48 and OT games read
   high). Format only at render time (`src/lib/format.ts`).
3. **Rank direction matters.** Lower is better for DRtg, TOV%, opponent eFG%, opponent FT rate,
   opponent OREB%. Use `rankTeams()` in `src/lib/analytics/ranks.ts`, never ad-hoc sorting.
4. **Small samples are flagged, not hidden.** Fewer than 5 games → show a "small sample" tag
   and the player's previous-season line (even if it was with another team) as a baseline.
5. **Season is derived, not hard-coded.** Use `CURRENT_SEASON` / `PREVIOUS_SEASON` from
   `src/lib/constants.ts` (frontend) and `CURRENT_SEASON_YEAR` from `etl/config.py`.
   Both roll over automatically on Oct 1 (US Eastern time); override with `NBA_SEASON` / `NEXT_PUBLIC_NBA_SEASON`.
6. **Synthetic data is labelled.** The demo seed sets the season display name to
   "… (demo data)" and the header shows it. Never present demo numbers as real.

Formulas, thresholds and the matchup projection model are documented in
`.claude/skills/basketball-metrics/SKILL.md` — update that file when you change the math.

## Data providers

- **stats.nba.com via `nba_api`** (primary, free, no key). Blocks many cloud/datacenter IPs
  — run the ETL from a home connection. Throttle ≥0.6 s between calls (`utils.safe_call`).
- **ESPN public site API** (injuries only, optional, unofficial — `etl/fetch_injuries.py`).
  If it breaks, the matchup page simply hides the availability panel.
- Considered but not integrated: BallDontLie (free tier lacks advanced stats), Sportradar /
  SportsDataIO (paid, best for official injuries + live play-by-play if ever needed).

## Conventions

- API responses use `successResponse()` / `notFound()` from `src/app/api/_lib/response.ts`
  and validate query params with zod (`src/app/api/_lib/validation.ts`).
- New UI fetches go through typed hooks in `src/lib/hooks/` that call `apiFetchSingle<T>()`
  with a type from `dashboard-types.ts` — no `any`, no per-hook field renaming.
- Business logic lives in `src/lib/analytics/` as pure functions with unit tests in
  `src/__tests__/lib/`. Route handlers only query + assemble.
- Charts use Recharts with `useThemeColors()`; reuse `glass-card`, `StatCard`, theme tokens
  in `globals.css`. Lakers purple `#552583` / gold `#FDB927`.
- ETL fetchers keep API parsing in pure `transform_*` functions so they are testable with
  fixture DataFrames (`etl/tests/unit/`). The older `etl/tests/test_*.py` files are
  post-load data checks that require a populated DB.

## Skills

| Skill                | Use when                                                           |
|----------------------|--------------------------------------------------------------------|
| `run-dashboard`      | Starting the app locally, seeding, screenshotting a change         |
| `refresh-nba-data`   | Pulling fresh data, debugging the ETL, adding a fetcher            |
| `season-rollover`    | A new season starts or the roster changes significantly           |
| `basketball-metrics` | Adding/changing any metric, rank, threshold or the projection      |
| `scouting-report`    | Writing a narrative pre-game report from `/api/matchup`           |
