# Lakers Analytics

A Los Angeles Lakers analytics app for the 2026-27 season. A Python ETL pulls stats from
stats.nba.com into Postgres (hosted on Supabase), and a Next.js app turns them into dashboards
you open in the browser. During games it also follows the Lakers live, straight from the NBA's
live feed.

| Page        | What it answers                                                                         |
|-------------|------------------------------------------------------------------------------------------|
| `/`         | How are the Lakers, and each player on the new roster, performing?                      |
| `/matchup`  | Who do we play next and where's the edge? What's happening tonight? How did it go?      |
| `/advanced` | How is any team metric trending game by game, against the season rate?                  |
| `/schedule` | When do we play, who's on TV, and where are the back-to-backs?                          |

Other pages: `/standings`, `/roster`, `/games`, `/players/[id]`, `/players/[id]/shots`, `/teams/[id]`.
A horizontal pill bar under the header switches between pages (it scrolls sideways on phones).

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

**Matchup (`/matchup`)** has three tabs:
- **Scouting report.** Defaults to the next scheduled opponent; you can pick any team.
  - A side-by-side comparison with ranks across all 30 teams.
  - Four-factor edges: our offense against their defense, and the reverse.
  - A projected score and win probability.
  - Key players with their last-5-game form, head-to-head results and injuries.
- **In-game.** Today's Lakers game from the NBA live feed, refreshed every 15 seconds while it's on. A **LIVE** badge on the tab shows when a game is in progress.
  - Score, current run, biggest leads, lead changes and possessions.
  - A game-flow chart, tonight's four factors, and the current five-man units with their stint margin.
  - Foul trouble, timeouts and bonus; where the points came from; the full box score; a shot map; the latest plays.
  - A game picker replays any finished Lakers game.
- **Post-game.** The saved reports in [`scouting/`](scouting/), rendered: each game's post-game analysis and its pre-game scouting report, one click apart.

**Advanced Analytics (`/advanced`)**
- Any of 17 team metrics (ratings, shooting, turnovers, rebounding, free throws, threes, and their defensive versions), opening on turnover %.
- Each game's value as a smooth curve, a 5-game average, and a dashed line for the season rate with the league rank.
- Season, last-5, last-game and best-game cards, plus a table of every metric.

**Schedule (`/schedule`)**
- A month calendar and a list view: results, tip-off times in your time zone, TV, NBA Cup games.
- Rest days and back-to-backs, games remaining home and away, and the next game.
- Click a game for its scouting report, or today's game for the In-game tab.

## How it fits together

```
stats.nba.com ─┐                                                    ┌─> /api/dashboard, /api/matchup,
(nba_api)      ├─> Python ETL ─> Postgres (Supabase) ─> Prisma ─────┤   /api/advanced, /api/schedule ─> pages
ESPN injuries ─┘   etl/refresh.py                                   │
cdn.nba.com live feed ─────────────────────────> /api/live ─────────┼─> Matchup → In-game
scouting/*.md (written by Claude Code) ────────> /api/reports ──────┘─> Matchup → Post-game
```

- **ETL** (`nba-analytics/etl/`) fetches data league-wide, so one daily run covers all 30 teams in about 45 API calls.
- **Database.** `nba-analytics/prisma/schema.prisma` is the schema. Production data lives in the Supabase project "Lakers Analytics West" (us-west-1). Row Level Security is on for every table with no policies, so the public Supabase API can't read or write anything.
- **Live data is display-only.** The In-game tab reads the NBA's live feed on demand through the app's server, and nothing from it is stored. The finished game reaches the database through the next refresh.
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

> **The In-game tab and saved reports need a local checkout on a home connection.** The NBA's
> live feed blocks cloud servers, and reports are read from the `scouting/` folder next to the app.
> If a code change doesn't show up while developing, restart `npm run dev`.

## Refreshing the data

Run this after games are final. Once a day is enough, and one run catches up any days you missed, for every team:

```bash
python3 -m venv etl-env
etl-env/bin/pip install nba_api pandas sqlalchemy "psycopg[binary]" psycopg2-binary python-dotenv requests pytest
etl-env/bin/python etl/refresh.py             # current season, all 30 teams, ~2–3 min
etl-env/bin/python etl/refresh.py --skip-injuries
```

> **Run the ETL from a home connection.** stats.nba.com and cdn.nba.com block cloud and
> datacenter IPs. With `DATABASE_URL` pointing at Supabase, the data lands in the shared
> database and the dashboards pick it up.

- **Safe to re-run.** `refresh.py` finishes with a table showing each step's result.
- **Safe during games.** Games still being played are skipped and saved by the first run after they end. Standings, schedule status and starters can lag the final buzzer a little.
- **More detail.** The `refresh-nba-data` skill covers each step and troubleshooting.

## Game reports

Claude Code writes Markdown reports into [`scouting/`](scouting/), and they show up in Matchup → Post-game:

- **Pre-game scouting reports** come from the matchup data. A report written after the fact is *backfilled*, using `/api/matchup?asOf=YYYY-MM-DD`, so only games before that date count. It says so at the top.
- **Post-game reports** come from the NBA's final box score and play-by-play (`npx tsx scripts/postgame-data.ts <gameId>`). They're graded against that game's pre-game keys. The script refuses to produce numbers that don't add up.

The [scouting README](scouting/README.md) indexes every game.

## Data sources

| Source | Used for | Notes |
|--------|----------|-------|
| [stats.nba.com](https://www.nba.com/stats) via [`nba_api`](https://github.com/swar/nba_api) | Games, box scores, rosters, schedule, standings, lineups, player season stats, shots | Free, no API key. Throttled to ≥0.6 s between calls. |
| cdn.nba.com live feed | In-game tab and post-game reports: live scoreboard, box score, play-by-play | The same feed NBA.com uses. Read through the app's server, never stored. Past games stay available. |
| ESPN public site API | Injury report (optional) | Unofficial, and only the current report: injuries can't be backfilled. If it breaks, the matchup page hides the availability panel. |
| cdn.nba.com | Player headshots | Loaded by the viewer's browser. Players without one show initials. |

None of these offer a public developer API with published terms. They're fine for personal use, but check the terms before publishing or commercial use.

## Data rules

- **No made-up or substitute metrics.** A missing value shows "—" with a reason.
- **Units.** Percentages are stored as 0–1 decimals. Ratings are per 100 possessions. Pace is possessions per game.
- **Rank direction.** Lower is better for DRtg, TOV% and the opponent shooting, free-throw and rebounding factors. Pace and 3PA rate are playing style: shown as "highest", never "best".
- **Small samples.** Fewer than 5 games gets a "small sample" tag and last season's line as a baseline.
- **Estimates.** Ratings and four factors are box-score estimates. They rank teams consistently but differ from NBA.com's tracked numbers by a few points.
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
                          basketball-metrics, scouting-report, postgame-report
scouting/                 saved pre-game scouting reports and post-game analyses
nba-analytics/
  etl/                    Python ETL (refresh.py = daily run; config.py = season + team constants)
  prisma/schema.prisma    database schema
  src/app/                pages and API routes (dashboard, matchup, live, schedule, advanced, reports)
  src/lib/analytics/      pure metric functions (ratings, ranks, projection, roster, plus-minus,
                          live game, post-game, schedule, metric trends)
  src/components/         dashboard, matchup, live-game, schedule and analytics UI
  scripts/                demo and test-fixture seeds (local Postgres only), postgame-data.ts
  e2e/                    Playwright tests
```

## Working with Claude Code

[`CLAUDE.md`](CLAUDE.md) and the skills in `.claude/skills/` explain the project to Claude Code. Ask it to:
- "refresh the data"
- "write a scouting report for the next game"
- "write a post-game report for last night's game"
- "backfill the scouting report for Oct 23"
- "add a metric"

It will follow the same rules as above.
