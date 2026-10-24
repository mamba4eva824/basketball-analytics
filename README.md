# Lakers Analytics

A Los Angeles Lakers analytics app for the 2026-27 season. A Python ETL pulls stats from
stats.nba.com into Postgres (hosted on Supabase), and a Next.js app turns them into two
dashboards you open in the browser.

| Page       | What it answers                                                                 |
|------------|----------------------------------------------------------------------------------|
| `/`        | How are the Lakers, and each player on the new roster, performing?             |
| `/matchup` | Who do we play next, how good are they, and where do we have the edge?         |

Other pages: `/standings`, `/roster`, `/games`, `/players/[id]`, `/players/[id]/shots`, `/teams/[id]`.

## What's on the dashboards

**Lakers (`/`)**
- Record, conference rank, streak and the next game.
- Offensive, defensive and net rating, plus pace, each with its league rank. You can switch between the season and the last 10 games.
- Net rating game by game, with a 5-game rolling line.
- The four factors on offense and defense.
- **Roster tracker.** Each player is tagged New, Returning or Rookie and shown with an NBA.com headshot. New players also show last season's line, from their previous team.
- **Plus-minus trend** with a moving average.
  - Games a player missed are left as gaps, so an injury doesn't flatten the line.
  - Per-36 mode is weighted by minutes.
- Rotation minutes heatmap, starting lineups, the most-used 5-man units, recent results and the schedule.

**Matchup (`/matchup`)**
- Defaults to the next scheduled opponent; you can pick any team.
- A side-by-side comparison with ranks across all 30 teams.
- Four-factor edges: our offense against their defense, and the reverse.
- A projected score and win probability.
- Key players with their last-5-game form, head-to-head results and injuries.

Pre-game write-ups built from this page are saved in [`scouting/`](scouting/).

## How it fits together

```
stats.nba.com ─┐                       ┌─> /api/dashboard/team/[id] ─> /
(nba_api)      ├─> Python ETL ─> Postgres (Supabase) ─> Prisma ─┤
ESPN injuries ─┘   etl/refresh.py                           └─> /api/matchup ───────> /matchup
```

- **ETL** (`nba-analytics/etl/`) fetches data league-wide, so one daily run covers all 30 teams in about 45 API calls.
- **Database.** `nba-analytics/prisma/schema.prisma` is the schema. Production data lives in the Supabase project "Lakers Analytics West" (us-west-1). Row Level Security is on for every table with no policies, so the public Supabase API can't read or write anything.
- **App.** Next.js 16, Prisma, TanStack Query, Recharts and Tailwind, with light, dark and auto themes. Every metric is computed in pure, unit-tested functions in `nba-analytics/src/lib/analytics/`.

## Quick start

You need Node 20+, Python 3.11+ and Postgres. All commands run from `nba-analytics/`.

```bash
cd nba-analytics
npm ci
cp .env.example .env          # then set DATABASE_URL (see below)
npx prisma generate
```

### Option A: real data (Supabase)

1. In `.env`, set `DATABASE_URL` to the Supabase **Session pooler** string, with your password filled in. You'll find it under Lakers Analytics West → Connect. Never commit it.
2. The schema is already applied there, so skip `prisma db push` and don't run the seed scripts.
3. Start the app: `npm run dev -- -p 4000`, then open <http://localhost:4000>.

### Option B: offline demo data (local Postgres)

```bash
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nba_analytics"
npx prisma db push
npx tsx scripts/seed-demo-data.ts   # synthetic league, labelled "(demo data)" in the header
npm run dev -- -p 4000
```

The seed scripts wipe the database first. They refuse to run against a non-local host.

## Refreshing the data

Run this each morning, after the previous night's games are final:

```bash
python3 -m venv etl-env
etl-env/bin/pip install nba_api pandas sqlalchemy "psycopg[binary]" psycopg2-binary python-dotenv requests pytest
etl-env/bin/python etl/refresh.py             # current season, all 30 teams, ~1–2 min
etl-env/bin/python etl/refresh.py --skip-injuries
```

> **Run the ETL from a home connection.** stats.nba.com and cdn.nba.com block cloud and
> datacenter IPs. With `DATABASE_URL` pointing at Supabase, the data lands in the shared
> database and the dashboards pick it up.

`refresh.py` finishes with a table showing each step's result, and it's safe to re-run. The
`refresh-nba-data` skill covers each step and troubleshooting.

## Data sources

| Source | Used for | Notes |
|--------|----------|-------|
| [stats.nba.com](https://www.nba.com/stats) via [`nba_api`](https://github.com/swar/nba_api) | Games, box scores, rosters, schedule, standings, lineups, player season stats, shots | Free, no API key. Throttled to ≥0.6 s between calls. |
| ESPN public site API | Injury report (optional) | Unofficial. If it breaks, the matchup page hides the availability panel. |
| cdn.nba.com | Player headshots | Loaded by the viewer's browser. Players without one show initials. |

## Data rules

- **No made-up or substitute metrics.** A missing value shows "—" with a reason.
- **Units.** Percentages are stored as 0–1 decimals. Ratings are per 100 possessions. Pace is possessions per game.
- **Rank direction.** Lower is better for DRtg, TOV% and the opponent shooting, free-throw and rebounding factors.
- **Small samples.** Fewer than 5 games gets a "small sample" tag and last season's line as a baseline.
- **Season.** It's derived from the date and rolls over on Oct 1 (US Eastern). Set `NBA_SEASON` or `NEXT_PUBLIC_NBA_SEASON` to override it.

Formulas, thresholds and the projection model are in
[`.claude/skills/basketball-metrics/SKILL.md`](.claude/skills/basketball-metrics/SKILL.md).

## Tests

```bash
npx tsc --noEmit                      # typecheck
npx vitest run src/__tests__/lib      # analytics unit tests (no DB)
etl-env/bin/pytest etl/tests/unit -q  # ETL transform tests (no network)

# API integration + e2e tests use a 2025-26 fixture, so pin the season:
npx tsx scripts/seed-test-data.ts && NEXT_PUBLIC_NBA_SEASON=2025-26 npm run dev -- -p 4000
npx vitest run
npx playwright test
```

## Repository layout

```
CLAUDE.md                 project guide for Claude Code (rules, commands, layout)
.claude/skills/           playbooks: run-dashboard, refresh-nba-data, season-rollover,
                          basketball-metrics, scouting-report
scouting/                 saved pre-game scouting reports
nba-analytics/
  etl/                    Python ETL (refresh.py = daily run; config.py = season + team constants)
  prisma/schema.prisma    database schema
  src/app/                pages and API routes (api/dashboard, api/matchup)
  src/lib/analytics/      pure metric functions (ratings, ranks, projection, roster, plus-minus)
  src/components/         dashboard and matchup UI
  scripts/                demo and test-fixture seeds (local Postgres only)
  e2e/                    Playwright tests
```

## Working with Claude Code

[`CLAUDE.md`](CLAUDE.md) and the skills in `.claude/skills/` explain the project to Claude Code. Ask it to:
- "refresh the data"
- "write a scouting report for the next game"
- "add a metric"

It will follow the same rules as above.
