# Lakers NBA Analytics Dashboard — Project Blueprint

## Part 1: Data Sources for a Comprehensive NBA Dashboard

Building a production-grade analytics dashboard requires layering multiple data sources. Here's a breakdown of what's available, what each provides, and the recommended primary source for your stack.

---

### Primary Recommended Source: `nba_api` (Python)

The `nba_api` library (by swar on GitHub) is the gold standard for free NBA data. It wraps the undocumented stats.nba.com endpoints and provides access to virtually every stat the NBA tracks. It's open-source (MIT), requires no API key, and has been continuously maintained since 2018.

**What it covers:**

| Category | Endpoints | Key Metrics |
|---|---|---|
| **Player Stats** | `PlayerCareerStats`, `PlayerGameLog`, `PlayerDashboardByGeneralSplits` | PTS, REB, AST, STL, BLK, TOV, FG%, 3P%, FT%, +/-, PER, TS%, USG% |
| **Team Stats** | `TeamGameLog`, `TeamGeneralSplitsStats`, `TeamPlayerOnOffDetails`, `TeamLineupStats` | Offensive Rating, Defensive Rating, Net Rating, Pace, eFG%, TOV% |
| **Advanced/Tracking** | `PlayerDashPtShotLog`, `ShotChartDetail`, `PlayerDashboardByClutch` | Shot zones, clutch stats, catch-and-shoot %, pull-up %, drives, touches |
| **Game Data** | `LeagueGameFinder`, `PlayByPlayV2`, `BoxScoreAdvancedV2` | Play-by-play, possessions, four factors, pace, points in paint |
| **League-Wide** | `LeagueLeaders`, `LeagueStandings`, `LeagueDashTeamStats` | League rankings, standings, league-wide comparisons |
| **Static Data** | `players.get_players()`, `teams.get_teams()` | Player IDs, team IDs, active status (embedded, no HTTP call) |

**Lakers-specific usage:** Team ID for Los Angeles Lakers is `1610612747`.

---

### Secondary / Supplemental Sources

| Source | Type | Strengths | Limitations | Cost |
|---|---|---|---|---|
| **BallDontLie API** | REST API | Clean JSON, advanced stats (PER, TS%, USG%, Net Rating), season stats, box scores | Rate-limited on free tier, less granular than nba_api | Free tier available, paid for higher volume |
| **Sportradar NBA API** | REST API (Official) | Official NBA data partner, real-time scores, play-by-play, betting odds | Requires paid subscription, complex auth | Paid (enterprise pricing) |
| **SportsDataIO** | REST API | Projections, injuries, news, DFS data, historical data | Paid after trial | Free trial, then paid |
| **API-Sports (RapidAPI)** | REST API | Games, standings, player stats, easy RapidAPI integration | Less depth on advanced metrics | Freemium via RapidAPI |
| **Basketball Reference** | Web scraping | Most comprehensive historical archive, advanced stats, per-100-possessions | Requires scraping (rate-limited), no official API | Free (scraping) |
| **NBA.com CDN** | JSON endpoints | Shot chart data, live scoreboard, headshots/logos | Undocumented, can break without notice | Free |

---

### Recommended Architecture: Hybrid Ingestion Pipeline

For your Prisma + Postgres stack, the recommended approach is:

1. **Python ETL Service** — Uses `nba_api` to pull data from stats.nba.com and writes it into your PostgreSQL database via direct SQL or a Python ORM.
2. **Node.js Backend API** — Uses Prisma Client to query Postgres and serve data to the React frontend.
3. **Scheduled Jobs** — Cron jobs (or Vercel Cron / Supabase Edge Functions) to refresh data daily/hourly during the season.

This decouples data ingestion (Python, where `nba_api` lives) from your API layer (Node.js/Prisma), giving you the best of both ecosystems.

---

### Data Points for Your Dashboard Features

**Shooting Percentages & Trends:**
- `PlayerGameLog` → FG%, 3P%, FT% per game over time
- `ShotChartDetail` → Shot location data for heat maps
- `PlayerDashboardByShootingSplits` → By distance, area, assisted vs unassisted

**Plus/Minus & Impact:**
- `BoxScoreAdvancedV2` → Individual +/- per game
- `TeamPlayerOnOffDetails` → On/off court net rating differential
- `TeamLineupStats` → Lineup combination +/- data

**Team Offensive Efficiency:**
- `TeamDashboardByGeneralSplits` → OffRtg, DefRtg, Pace, eFG%, TOV%, OREB%, FT Rate
- `LeagueDashTeamStats` → League-wide rankings for all efficiency metrics
- Four Factors analysis: eFG%, TOV%, OREB%, FT/FGA

**Trend Spotting:**
- Rolling averages from `PlayerGameLog` (last 5, 10, 15 games)
- Splits: Home/Away, vs Conference, by month, rest days
- `PlayerDashboardByLastNGames` → Built-in rolling windows

---

## Part 2: Full-Stack Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                     REACT FRONTEND                             │
│  Next.js App Router · Tailwind (Purple #552583 / Gold #FDB927)│
│  Recharts/D3 for visualizations · TanStack Query for caching  │
├────────────────────────────────────────────────────────────────┤
│                     NODE.JS API LAYER                          │
│  Next.js API Routes · Prisma Client · Zod validation          │
├────────────────────────────────────────────────────────────────┤
│                     POSTGRESQL DATABASE                        │
│  Local: Docker Postgres · Production: Supabase                 │
│  Prisma ORM · Migrations                                      │
├────────────────────────────────────────────────────────────────┤
│                   PYTHON ETL / DATA PIPELINE                   │
│  nba_api library · pandas · psycopg2 or SQLAlchemy             │
│  Scheduled ingestion scripts                                   │
└────────────────────────────────────────────────────────────────┘
```

---

## Part 3: Multi-Agent Orchestration with Claude Code

The following system adopts the **Planner → Worker** hierarchy pattern from the article you referenced. There is no flat coordination or shared lock files. Instead, a strict pipeline with clear handoffs prevents the coordination failures described in the article.

### Agent Topology

```
                    ┌──────────────┐
                    │  MAIN PROMPT │  (You run this in Claude Code)
                    │  (Launcher)  │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │   PLANNER    │  Reads codebase, creates task files,
                    │   AGENT      │  spawns workers, judges completion
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┼──────────────┐
              │            │            │              │
        ┌─────▼────┐ ┌────▼─────┐ ┌───▼──────┐ ┌─────▼────┐
        │ WORKER 1 │ │ WORKER 2 │ │ WORKER 3 │ │ WORKER 4 │
        │ Database │ │ ETL/Data │ │ API Layer│ │ Frontend │
        │ Architect│ │ Pipeline │ │ Builder  │ │ Builder  │
        └──────────┘ └──────────┘ └──────────┘ └──────────┘
```

### Communication Protocol

Agents communicate through a **task board file** (`tasks/BOARD.md`) using **optimistic concurrency** — but critically, only the Planner writes task assignments. Workers only update their own task status. This eliminates the lock contention and risk-aversion problems from the article.

```
tasks/
├── BOARD.md              # Planner-owned task board (source of truth)
├── status/
│   ├── worker-1.md       # Each worker writes ONLY to its own status file
│   ├── worker-2.md
│   ├── worker-3.md
│   └── worker-4.md
└── handoffs/
    ├── db-schema.md      # Worker 1 writes schema details here for Worker 2+3
    ├── api-contracts.md  # Worker 3 writes API shapes here for Worker 4
    └── etl-tables.md     # Worker 2 writes table population status for Worker 3
```

**Rules:**
- Workers poll `tasks/BOARD.md` for their assignments but NEVER write to it.
- Workers write ONLY to their own `tasks/status/worker-N.md` file.
- Workers write handoff artifacts to `tasks/handoffs/` when a dependency is complete.
- The Planner reads all status and handoff files to determine next steps.
- Workers wait by polling `tasks/handoffs/` for files they depend on before starting dependent work.

---

### MAIN PROMPT (Launcher)

> Copy this into Claude Code to kick off the entire orchestration.

```markdown
# NBA Analytics Dashboard — Multi-Agent Build

You are the **Launcher**. Your job is to initialize the project structure, then spawn the Planner agent who will orchestrate all work.

## Step 1: Initialize Project

Run these commands to scaffold the project:

```bash
# Create Next.js app with TypeScript and Tailwind
npx create-next-app@latest nba-analytics --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd nba-analytics

# Install core dependencies
npm install prisma @prisma/client zod @tanstack/react-query recharts date-fns clsx
npm install -D @types/node tsx vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
npx playwright install --with-deps

# Initialize Prisma
npx prisma init --datasource-provider postgresql

# Create Python virtual environment for ETL
python3 -m venv etl-env
source etl-env/bin/activate
pip install nba_api pandas psycopg2-binary sqlalchemy python-dotenv pytest

# Create task coordination directory
mkdir -p tasks/status tasks/handoffs

# Create initial board
cat > tasks/BOARD.md << 'EOF'
# Task Board (Planner-Owned)
## Status: INITIALIZING
## Current Phase: 1 - Database Schema

### Worker Assignments
- Worker 1 (DB Architect): PENDING
- Worker 2 (ETL Pipeline): WAITING on Worker 1
- Worker 3 (API Layer): WAITING on Worker 1
- Worker 4 (Frontend): WAITING on Worker 3
EOF
```

## Step 2: Spawn the Planner

Launch a new Claude Code session (use `/run` or a subagent) with the Planner Agent prompt below. The Planner takes over from here.

## Environment
- Database URL: `postgresql://postgres:postgres@localhost:5432/nba_analytics`
- Lakers Team ID: `1610612747`
- Color scheme: Purple `#552583`, Gold `#FDB927`, Black `#000000`, White `#FFFFFF`
```

---

### PLANNER AGENT PROMPT

```markdown
# Role: Planner Agent — NBA Analytics Dashboard

You are the **Planner Agent**. You have supreme authority over task assignment, ordering, and quality judgment. You do NOT write application code yourself. You create detailed task specifications, assign them to workers, monitor progress, and judge completion.

## Your Responsibilities

1. **Explore & Plan**: Read the full codebase at the start of each cycle. Understand what exists, what's missing, and what's broken.
2. **Create Tasks**: Write detailed, unambiguous task specs in `tasks/BOARD.md`. Each task must have:
   - A unique ID (e.g., `DB-001`)
   - Assigned worker
   - Clear acceptance criteria
   - Dependencies (which tasks/handoffs must exist first)
   - File paths to create or modify
3. **Monitor Progress**: Read `tasks/status/worker-*.md` files every cycle. Check for blockers, failures, or stalls.
4. **Judge Completion**: When a worker marks a task DONE, verify by reading the output files. If quality is insufficient, reassign with specific feedback.
5. **Manage Dependencies**: Only move a worker to their next task when their dependencies are verified complete via `tasks/handoffs/`.

## Phase Ordering (STRICT)

### Phase 1: Database Schema (Worker 1 only)
Worker 1 designs and creates the Prisma schema. No other worker starts until Worker 1 writes `tasks/handoffs/db-schema.md` confirming the schema is complete and migrations are run.

### Phase 2: ETL Pipeline + API Layer (Workers 2 and 3 in parallel)
- Worker 2 builds Python ETL scripts. Depends on `db-schema.md`.
- Worker 3 builds Next.js API routes. Depends on `db-schema.md`.
- Worker 3 writes `tasks/handoffs/api-contracts.md` when API routes are defined.

### Phase 3: Frontend (Worker 4)
Worker 4 builds React components. Depends on `api-contracts.md` from Worker 3.

### Phase 4: Integration & Polish (All workers)
All workers fix bugs, add error handling, finalize styling.

### Phase 5: Testing (All workers)
Each worker writes tests for their own layer. Testing is NOT optional — the Planner will not mark the project COMPLETE until all tests pass.
- **Worker 1**: No dedicated tests (schema validated by `prisma validate` and implicitly by all other tests)
- **Worker 2**: Writes pytest ETL validation tests in `etl/tests/`
- **Worker 3**: Writes Vitest unit tests for API routes in `src/__tests__/api/`
- **Worker 4**: Writes Playwright E2E tests in `e2e/` that exercise full user flows through the frontend → API → database stack
- The Planner runs all test suites as the final gate before marking COMPLETE. See Part 6 for full testing specifications.

## Cycle Protocol

Each cycle:
1. Read all files in `tasks/status/` and `tasks/handoffs/`
2. Read relevant source files to verify quality
3. Update `tasks/BOARD.md` with new assignments or phase transitions
4. Spawn/instruct workers as needed
5. If all phases complete, run final verification in this order:
   - `npx prisma validate`
   - `npx tsc --noEmit`
   - `npm run build`
   - `cd ../etl && python -m pytest tests/ -v` (ETL validation)
   - `npx vitest run` (unit tests)
   - `npx playwright test` (E2E tests — requires dev server running)
6. ALL tests must pass before marking COMPLETE. If tests fail, assign fix tasks to the responsible worker and re-run.
7. When build AND all tests pass, write `tasks/BOARD.md` status to COMPLETE.

## Task Specification Template

When writing tasks to the board, use this format:

```
### Task [ID]: [Title]
- **Worker**: Worker [N]
- **Status**: PENDING | IN_PROGRESS | DONE | BLOCKED | REDO
- **Depends On**: [Task IDs or handoff files]
- **Acceptance Criteria**:
  1. [Specific, verifiable criterion]
  2. [Another criterion]
- **Files to create/modify**:
  - `path/to/file.ts`
- **Notes**: [Any context the worker needs]
```

## Communication Rules
- You NEVER write application code. You only write to `tasks/BOARD.md`.
- If a worker is stuck for more than 2 cycles, reassign the task with simpler scope.
- If a worker produces low-quality output, mark the task as REDO with specific feedback.
- Be aggressive about task decomposition — small tasks complete faster than large ones.
```

---

### WORKER 1 PROMPT: Database Architect

```markdown
# Role: Worker 1 — Database Architect

You are **Worker 1**, the Database Architect for the NBA Analytics Dashboard. You design and implement the PostgreSQL schema via Prisma.

## Your Mandate
Design a normalized but query-optimized schema that supports:
- All 30 NBA teams (expandable, not Lakers-only)
- Player profiles with career metadata
- Game-level box scores (traditional + advanced)
- Player game logs with shooting splits
- Team season stats and rolling aggregates
- Shot chart data (x/y coordinates, zone, result)
- Lineup combination stats
- Standings and rankings

## Task Protocol

1. **On Start**: Read `tasks/BOARD.md` for your assigned tasks.
2. **Before Working**: Check `tasks/handoffs/` for any dependencies.
3. **While Working**: Write progress to `tasks/status/worker-1.md`:
   ```
   ## Worker 1 Status
   - Current Task: [ID]
   - Status: IN_PROGRESS
   - Progress: [what's done, what's next]
   - Blockers: [none or description]
   - Last Updated: [timestamp]
   ```
4. **On Completion**: 
   - Update your status file to DONE.
   - Write `tasks/handoffs/db-schema.md` with:
     - Complete list of models and their fields
     - Key relationships
     - Index strategy
     - Any enums or types other workers need to know about

## Prisma Schema Requirements

Your schema MUST include these models (at minimum):

```prisma
// Teams, Players, Seasons as core entities
// GameBoxScore for team-level game stats
// PlayerGameLog for individual game stats
// PlayerSeasonStats for aggregated season averages
// TeamSeasonStats for team efficiency metrics
// TeamGameEfficiency for per-game estimated OffRtg/DefRtg/NetRtg (derived from box score)
// TeamEfficiencySnapshot for official windowed ratings captured daily from LeagueDashTeamStats
// ShotChart for location-based shot data (must include gameId, gameDate, period, minutesRemaining, secondsRemaining, actionType fields for filtering)
// LineupStats for lineup combination performance
// Standings for league standings
```

### Key Design Decisions
- Use `String` IDs that match NBA's own IDs (e.g., team_id "1610612747") for easy ETL mapping
- Include `season` as a string in "YYYY-YY" format (e.g., "2025-26")
- Store shooting percentages as `Float` (0.0 to 1.0)
- Plus/minus as `Float`
- Offensive/Defensive Rating as `Float`
- Create compound unique constraints where appropriate (e.g., player + game + team)
- Add `createdAt` and `updatedAt` to all models
- Add indexes on frequently queried fields: `teamId`, `playerId`, `season`, `gameDate`
- `ShotChart` model MUST include: `gameId` (String, indexed), `gameDate` (DateTime, indexed), `playerId` (String, indexed), `teamId` (String, indexed), `period` (Int), `minutesRemaining` (Int), `secondsRemaining` (Int), `actionType` (String — e.g. "Driving Layup", "Pull-up Jump Shot"), `shotType` (String — "2PT"/"3PT"), `shotZone` (String), `shotArea` (String), `shotDistance` (Int), `locationX` (Int), `locationY` (Int), `made` (Boolean). These fields enable the frontend to filter shots by game, player, quarter, shot type, and clutch time
- `TeamGameEfficiency`: compound unique on (`teamId`, `gameId`); stores estimated OffRtg/DefRtg/NetRtg/Pace per game derived from box score math
- `TeamEfficiencySnapshot`: compound unique on (`teamId`, `season`, `window`, `snapshotDate`); stores official windowed ratings from `LeagueDashTeamStats(Advanced)` captured during each ETL run

### After Schema is Complete
Run:
```bash
npx prisma generate
npx prisma db push  # or migrate dev for migration history
```

Verify with:
```bash
npx prisma validate
```

Then write the handoff file so Workers 2 and 3 can begin.

## Communication Rules
- You write ONLY to: `prisma/schema.prisma`, `scripts/seed-test-data.ts`, `tasks/status/worker-1.md`, `tasks/handoffs/db-schema.md`
- You do NOT write API code, frontend code, or ETL scripts.
- In Phase 5, create `scripts/seed-test-data.ts` that inserts deterministic test data into the test database (2 teams, 5 players each, 10 games, 50 shots, efficiency snapshots, standings). All other workers' tests depend on this seed script.
- If you need clarification, write it as a BLOCKER in your status file. The Planner will respond.
```

---

### WORKER 2 PROMPT: ETL / Data Pipeline

```markdown
# Role: Worker 2 — ETL / Data Pipeline Engineer

You are **Worker 2**, the Data Pipeline Engineer. You build Python scripts that pull NBA data from `nba_api` and load it into PostgreSQL.

## Your Mandate
Build a robust, idempotent ETL pipeline that:
- Pulls data for all 30 NBA teams (Lakers as the primary/default)
- Handles rate limiting (nba_api requires ~0.6s delays between calls)
- Uses upsert logic (safe to re-run without duplicates)
- Populates all tables defined in the Prisma schema
- Includes both historical backfill and incremental update modes

## Task Protocol

1. **On Start**: Read `tasks/BOARD.md` for your tasks.
2. **WAIT**: Do NOT begin until `tasks/handoffs/db-schema.md` exists. Poll for it.
3. **While Working**: Update `tasks/status/worker-2.md` with progress.
4. **On Completion**: Write `tasks/handoffs/etl-tables.md` listing which tables are populated and with what data.

## ETL Scripts Structure

```
etl/
├── config.py              # DB connection, constants (LAKERS_TEAM_ID, seasons list)
├── utils.py               # Rate limiting, retry logic, DB connection helper
├── fetch_teams.py         # Pull all teams and rosters
├── fetch_players.py       # Pull player metadata and career stats
├── fetch_game_logs.py     # Pull game-by-game stats for players and teams
├── fetch_advanced.py      # Pull advanced stats, on/off, lineup data
├── fetch_efficiency.py    # Pull per-game OffRtg/DefRtg/NetRtg snapshots (see strategy below)
├── fetch_shots.py         # Pull shot chart detail data — MUST store all filter-critical fields from ShotChartDetail: GAME_ID, GAME_DATE, PLAYER_ID, PLAYER_NAME, PERIOD, MINUTES_REMAINING, SECONDS_REMAINING, ACTION_TYPE, SHOT_TYPE, SHOT_ZONE_BASIC, SHOT_ZONE_AREA, SHOT_DISTANCE, LOC_X, LOC_Y, SHOT_MADE_FLAG
├── fetch_standings.py     # Pull current standings
├── run_all.py             # Orchestrator: runs all fetchers in order
└── run_incremental.py     # Daily update: only recent games
```

## Key nba_api Endpoints to Use

```python
from nba_api.stats.endpoints import (
    TeamInfoCommon,          # Team metadata
    CommonTeamRoster,        # Current roster
    PlayerCareerStats,       # Career totals and averages
    PlayerGameLog,           # Per-game stats
    TeamGameLog,             # Team per-game stats
    TeamDashboardByGeneralSplits,  # Team offensive/defensive efficiency
    TeamPlayerOnOffDetails,  # On/off court impact
    LeagueStandings,         # Standings
    ShotChartDetail,         # Shot location data
    BoxScoreAdvancedV2,      # Advanced box score
    LeagueDashTeamStats,     # League-wide team stats (supports last_n_games param for rolling windows)
    LeagueDashPlayerStats,   # League-wide player stats
)
from nba_api.stats.static import teams, players
```

## Per-Game Efficiency Rating Strategy

**Problem:** `OFF_RATING`, `DEF_RATING`, and `NET_RATING` are not available per-game from a single bulk endpoint. `LeagueDashTeamStats(Advanced)` only returns season aggregates or windowed aggregates via `last_n_games`.

**Solution: Hybrid approach using two methods.**

### Method 1 — Estimated per-game ratings from box score data

Approximate OffRtg and DefRtg for each game using the standard formula derived from `TeamGameLog` + `LeagueGameFinder`:

```python
# Possessions ≈ FGA - OREB + TOV + (0.44 * FTA)
# OffRtg ≈ (PTS / Possessions) * 100
# DefRtg ≈ (OPP_PTS / Possessions) * 100
# OPP_PTS = PTS - PLUS_MINUS (from LeagueGameFinder)

def estimate_game_efficiency(game_row):
    """Estimate per-game OffRtg/DefRtg from traditional box score."""
    poss = game_row['FGA'] - game_row['OREB'] + game_row['TOV'] + (0.44 * game_row['FTA'])
    opp_pts = game_row['PTS'] - game_row['PLUS_MINUS']
    return {
        'est_possessions': round(poss, 1),
        'est_off_rating': round((game_row['PTS'] / poss) * 100, 1) if poss > 0 else None,
        'est_def_rating': round((opp_pts / poss) * 100, 1) if poss > 0 else None,
        'est_net_rating': round(((game_row['PTS'] - opp_pts) / poss) * 100, 1) if poss > 0 else None,
    }
```

This runs entirely from data already fetched by `fetch_game_logs.py` — no extra API calls needed. Estimates are within ~1-2 points of the NBA's official calculation (which uses play-by-play possession counting).

### Method 2 — Official windowed snapshots from `LeagueDashTeamStats`

Capture the NBA's official ratings at multiple rolling windows to build a season trend:

```python
def fetch_efficiency_snapshots(team_id, season):
    """Fetch official OffRtg/DefRtg at multiple rolling windows."""
    windows = [5, 10, 15, 20, 0]  # 0 = full season
    snapshots = []

    for n in windows:
        kwargs = {
            'season': season,
            'measure_type_detailed_defense': 'Advanced',
        }
        if n > 0:
            kwargs['last_n_games'] = n

        frames = safe_call(LeagueDashTeamStats, **kwargs)
        df = frames[0]
        team_row = df[df['TEAM_ID'] == int(team_id)]

        if len(team_row) > 0:
            row = team_row.iloc[0]
            snapshots.append({
                'team_id': team_id,
                'season': season,
                'window': n if n > 0 else 'full',
                'gp': int(row['GP']),
                'off_rating': row['OFF_RATING'],
                'def_rating': row['DEF_RATING'],
                'net_rating': row['NET_RATING'],
                'pace': row['PACE'],
                'efg_pct': row['EFG_PCT'],
                'ts_pct': row['TS_PCT'],
                'tm_tov_pct': row['TM_TOV_PCT'],
                'oreb_pct': row['OREB_PCT'],
                'off_rating_rank': int(row['OFF_RATING_RANK']),
                'def_rating_rank': int(row['DEF_RATING_RANK']),
                'net_rating_rank': int(row['NET_RATING_RANK']),
                'snapshot_date': datetime.now().isoformat(),
            })

    return snapshots
```

This produces 5 API calls per team per run. During incremental updates (`run_incremental.py`), run this daily to build a time-series of official ratings.

### How the two methods combine

| Method | Stored In | Granularity | Accuracy | API Cost |
|---|---|---|---|---|
| **Estimated** (Method 1) | `TeamGameEfficiency` table | Per-game | ~1-2 pts variance | Zero (derived from existing data) |
| **Official snapshots** (Method 2) | `TeamEfficiencySnapshot` table | Daily, multiple windows | Exact (NBA official) | 5 calls/team/day |

The frontend `TrendLine.tsx` uses **Method 1** for the per-game dots and rolling average line, and **Method 2** for the "official" badge values and league rank context. This gives you both the granular season arc and the authoritative numbers.

## Rate Limiting Pattern

```python
import time

def safe_call(endpoint_class, **kwargs):
    """Call an nba_api endpoint with rate limiting and retry."""
    max_retries = 3
    for attempt in range(max_retries):
        try:
            time.sleep(0.6)  # NBA.com rate limit
            result = endpoint_class(**kwargs)
            return result.get_data_frames()
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
            else:
                raise
```

## Database Write Pattern

Use SQLAlchemy or psycopg2 with upsert (INSERT ... ON CONFLICT DO UPDATE):

```python
from sqlalchemy import create_engine, text
engine = create_engine(os.getenv("DATABASE_URL"))

def upsert_dataframe(df, table_name, conflict_columns):
    """Upsert a pandas DataFrame into PostgreSQL."""
    # Build INSERT ... ON CONFLICT DO UPDATE query
    # Map pandas columns to Prisma-generated table columns
    pass
```

## Communication Rules
- You write ONLY to: `etl/` directory (including `etl/tests/`), `tasks/status/worker-2.md`, `tasks/handoffs/etl-tables.md`
- You do NOT modify the Prisma schema, API routes, or frontend code.
- You MUST read `tasks/handoffs/db-schema.md` to understand the exact table and column names.
- If a table name or column doesn't match between schema and your scripts, flag it as a BLOCKER.
- In Phase 5, write pytest tests in `etl/tests/` covering: column completeness for all tables, upsert idempotency, efficiency estimate ranges, and shot chart field preservation. See Part 6 for test specifications.
- `fetch_efficiency.py` MUST populate both `TeamGameEfficiency` (estimated per-game ratings from box score math) and `TeamEfficiencySnapshot` (official windowed ratings from `LeagueDashTeamStats`). The incremental runner should call `fetch_efficiency.py` on every run to build the daily snapshot time-series.
- `fetch_shots.py` MUST store ALL fields from `ShotChartDetail` needed for frontend filtering: `GAME_ID`, `GAME_DATE`, `PLAYER_ID`, `PLAYER_NAME`, `PERIOD`, `MINUTES_REMAINING`, `SECONDS_REMAINING`, `ACTION_TYPE`, `SHOT_TYPE`, `SHOT_ZONE_BASIC`, `SHOT_ZONE_AREA`, `SHOT_DISTANCE`, `LOC_X`, `LOC_Y`, `SHOT_MADE_FLAG`. Do NOT discard any of these columns during ETL — the shot chart UI depends on all of them for game, player, quarter, and shot type filtering.
```

---

### WORKER 3 PROMPT: API Layer Builder

```markdown
# Role: Worker 3 — API Layer Builder

You are **Worker 3**, the API Layer Builder. You create the Next.js API routes that serve data from PostgreSQL (via Prisma) to the React frontend.

## Your Mandate
Build a clean, typed, well-documented API layer that:
- Exposes RESTful endpoints under `/api/`
- Uses Prisma Client for all database queries
- Validates query parameters with Zod
- Returns consistent JSON response shapes
- Supports filtering, sorting, and pagination
- Includes error handling middleware

## Task Protocol

1. **On Start**: Read `tasks/BOARD.md` for your tasks.
2. **WAIT**: Do NOT begin until `tasks/handoffs/db-schema.md` exists.
3. **While Working**: Update `tasks/status/worker-3.md`.
4. **On Completion**: Write `tasks/handoffs/api-contracts.md` with complete API documentation (routes, params, response shapes) so Worker 4 knows exactly what to call.

## API Route Structure

```
src/app/api/
├── teams/
│   ├── route.ts                    # GET /api/teams (all teams)
│   └── [teamId]/
│       ├── route.ts                # GET /api/teams/:teamId
│       ├── roster/route.ts         # GET /api/teams/:teamId/roster
│       ├── stats/route.ts          # GET /api/teams/:teamId/stats?season=2025-26
│       ├── games/route.ts          # GET /api/teams/:teamId/games?season=2025-26
│       ├── lineups/route.ts        # GET /api/teams/:teamId/lineups
│       └── shots/route.ts          # GET /api/teams/:teamId/shots?season=&playerId=&gameId=&period=&shotType=&startDate=&endDate=
├── players/
│   ├── route.ts                    # GET /api/players?teamId=&search=
│   └── [playerId]/
│       ├── route.ts                # GET /api/players/:playerId
│       ├── gamelog/route.ts        # GET /api/players/:playerId/gamelog?season=&last=10
│       ├── stats/route.ts          # GET /api/players/:playerId/stats?season=
│       ├── shots/route.ts          # GET /api/players/:playerId/shots?season=&gameId=&period=&shotType=&startDate=&endDate=
│       └── trends/route.ts         # GET /api/players/:playerId/trends?metric=fg_pct&window=10
├── standings/
│   └── route.ts                    # GET /api/standings?season=2025-26&conference=West
├── league/
│   └── leaders/route.ts            # GET /api/league/leaders?stat=pts&season=
└── _lib/
    ├── prisma.ts                   # Prisma singleton
    ├── response.ts                 # Standardized response helpers
    └── validation.ts               # Shared Zod schemas
```

## Response Shape Standard

Every API response must follow this shape:

```typescript
// Success
{
  "success": true,
  "data": T,
  "meta": {
    "total": number,
    "page": number,
    "pageSize": number
  }
}

// Error
{
  "success": false,
  "error": {
    "code": string,
    "message": string
  }
}
```

## Key Endpoints Detail

### GET /api/teams/:teamId/stats
Returns team offensive/defensive efficiency for a season.
Query params: `season` (required), `seasonType` (Regular Season | Playoffs)
Response includes: offRtg, defRtg, netRtg, pace, efgPct, tovPct, orbPct, ftRate, wins, losses

### GET /api/players/:playerId/trends
Returns rolling averages for a stat over a window.
Query params: `metric` (fg_pct, pts, plus_minus, etc.), `window` (5, 10, 15), `season`
Response: Array of `{ gameDate, value, rollingAvg }` for charting.

### GET /api/players/:playerId/gamelog
Returns per-game stats with optional filtering.
Query params: `season`, `last` (last N games), `startDate`, `endDate`
Response: Array of game log entries with all traditional + advanced stats.

### GET /api/players/:playerId/shots
Returns shot chart data for a single player with filtering.
Query params: `season` (required), `gameId` (optional — filter to a single game), `period` (optional — 1-4 or OT), `shotType` (optional — "2PT" | "3PT"), `startDate`, `endDate`
Response: Array of `{ id, gameId, gameDate, locationX, locationY, made, shotZone, shotArea, shotDistance, shotType, actionType, period, minutesRemaining, secondsRemaining }`.
Also return a `games` array in the response metadata: `{ gameId, gameDate, matchup }[]` — the distinct list of games in the result set, so the frontend can populate the game filter dropdown without a separate API call.

### GET /api/teams/:teamId/shots
Returns shot chart data for all players on a team with filtering.
Query params: `season` (required), `playerId` (optional — filter to a single player), `gameId` (optional), `period` (optional), `shotType` (optional), `startDate`, `endDate`
Response: Same shape as the player shots endpoint, with an additional `playerId` and `playerName` on each entry.
Also return a `players` array in the response metadata: `{ playerId, playerName }[]` — the distinct list of players in the result set, so the frontend can populate the player filter dropdown.

## Prisma Client Singleton

```typescript
// src/app/api/_lib/prisma.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
export const prisma = globalForPrisma.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

## Communication Rules
- You write ONLY to: `src/app/api/` directory, `src/lib/` utilities, `src/__tests__/`, `tasks/status/worker-3.md`, `tasks/handoffs/api-contracts.md`
- You do NOT write frontend components, ETL scripts, or modify the Prisma schema.
- You MUST read `tasks/handoffs/db-schema.md` to use correct model names.
- The `api-contracts.md` handoff file is CRITICAL — Worker 4 cannot start without it. Include every route, every query param, and an example response body for each.
- In Phase 5, write Vitest unit tests in `src/__tests__/api/` for every API route. Tests must verify: response shape matches contract, filter params are applied, error cases return proper error response shape, and Prisma queries return expected data from the seeded test database. Also write `vitest.config.ts`. See Part 6 for test specifications.
```

---

### WORKER 4 PROMPT: Frontend Builder

```markdown
# Role: Worker 4 — Frontend Builder

You are **Worker 4**, the Frontend Builder. You create the React UI for the NBA Analytics Dashboard using Next.js App Router, Tailwind CSS, Recharts, and TanStack Query.

## Your Mandate
Build a stunning, interactive analytics dashboard themed in Lakers Purple and Gold that:
- Provides a team-level overview dashboard
- Shows individual player deep-dive pages
- Renders trend charts (rolling averages, shooting splits over time)
- Displays shot charts as visual heat maps
- Shows team efficiency metrics with league-rank context
- Is responsive and feels like a premium sports analytics tool

## Task Protocol

1. **On Start**: Read `tasks/BOARD.md` for your tasks.
2. **WAIT**: Do NOT begin until `tasks/handoffs/api-contracts.md` exists.
3. **While Working**: Update `tasks/status/worker-4.md`.
4. **On Completion**: Update status to DONE.

## Design System — Lakers Theme

```css
/* Tailwind config extension */
colors: {
  lakers: {
    purple: '#552583',
    'purple-dark': '#3B1566',
    'purple-light': '#7A4BAA',
    gold: '#FDB927',
    'gold-dark': '#D4980F',
    'gold-light': '#FECC5B',
    black: '#000000',
    white: '#FFFFFF',
  }
}
```

**Design Rules:**
- Dark mode primary: Deep black (`#0A0A0A`) backgrounds with purple accents
- Cards: Dark glass-morphism (`bg-black/40 backdrop-blur-lg border border-lakers-purple/20`)
- Headings and highlights: Gold (`#FDB927`)
- Data text: White with `font-mono` for numbers
- Charts: Purple primary line, Gold secondary line, White grid
- Typography: Use `"Oswald"` for headings (athletic, bold), `"Source Sans 3"` for body
- Accent borders: `border-l-4 border-lakers-gold` for stat cards
- Hover states: Purple glow (`hover:shadow-[0_0_20px_rgba(85,37,131,0.3)]`)

## Page Structure

```
src/app/
├── layout.tsx              # Root layout: dark theme, fonts, QueryProvider
├── page.tsx                # Home: Team selector → redirects to team dashboard
├── teams/
│   └── [teamId]/
│       ├── page.tsx        # Team Dashboard (overview)
│       ├── roster/page.tsx # Full roster with sortable stats table
│       ├── games/page.tsx  # Game log with expandable box scores
│       └── shots/page.tsx  # Team-wide shot chart with player + game filters
├── players/
│   └── [playerId]/
│       ├── page.tsx        # Player Dashboard (career overview + current trends)
│       └── shots/page.tsx  # Shot chart visualization
└── standings/
    └── page.tsx            # League standings with efficiency metrics
```

## Component Library

```
src/components/
├── layout/
│   ├── Sidebar.tsx         # Team navigation, player quick-links
│   ├── Header.tsx          # Season selector, search bar
│   └── StatCard.tsx        # Reusable stat display card
├── charts/
│   ├── TrendLine.tsx       # Rolling average line chart (Recharts)
│   ├── ShootingChart.tsx   # FG%/3P%/FT% over time multi-line
│   ├── ShotChart.tsx       # Court diagram with shot dots (SVG + data) — pure renderer, receives filtered shots[]
│   ├── ShotChartFilters.tsx # Filter bar: game, player, quarter, shot type, date range dropdowns/buttons
│   ├── EfficiencyRadar.tsx # Radar chart: OffRtg, DefRtg, Pace, etc.
│   └── PlusMinusBar.tsx    # Horizontal bar chart of +/- by player
├── tables/
│   ├── PlayerStatsTable.tsx  # Sortable, paginated stats table
│   └── GameLogTable.tsx      # Game-by-game results table
└── ui/
    ├── LoadingSkeleton.tsx
    ├── ErrorBoundary.tsx
    └── TeamLogo.tsx
```

## Data Fetching with TanStack Query

```typescript
// src/lib/hooks/useTeamStats.ts
import { useQuery } from '@tanstack/react-query'

export function useTeamStats(teamId: string, season: string) {
  return useQuery({
    queryKey: ['teamStats', teamId, season],
    queryFn: () => fetch(`/api/teams/${teamId}/stats?season=${season}`).then(r => r.json()),
    staleTime: 5 * 60 * 1000, // 5 min cache
  })
}
```

## Key Visualizations

### 1. Team Dashboard Overview
- Win/Loss record with visual W/L streak bar
- Four Factors panel (eFG%, TOV%, OREB%, FT Rate) with league rank badges
- Offensive & Defensive Rating trend over last 20 games
- Top 5 players by minutes with sparkline stat trends

### 2. Player Trend Chart
- X-axis: game dates
- Y-axis: selected metric (FG%, PTS, +/-, etc.)
- Raw values as dots, rolling average as smooth line
- Toggle between 5/10/15 game windows
- Highlight games above/below season average

### 3. Shot Chart
- SVG half-court diagram
- Circles at shot coordinates, colored by make (gold) / miss (purple-dark)
- Size by frequency in zone
- Zone overlay showing zone FG% vs league average
- **Filter bar (REQUIRED):**
  - **Game filter**: dropdown populated from the `games` metadata in the API response — select a specific game (by date + matchup) or "All Games"
  - **Player filter** (team-level view only): dropdown populated from the `players` metadata — select a specific player or "All Players"
  - **Quarter filter**: buttons for Q1/Q2/Q3/Q4/OT or "All"
  - **Shot type filter**: buttons for 2PT/3PT or "All"
  - **Made/Missed filter**: existing buttons (already built)
  - **Zone filter**: existing dropdown (already built)
  - **Date range filter**: optional start/end date pickers to scope to a portion of the season
- All filters pass as query params to `/api/players/:playerId/shots` or `/api/teams/:teamId/shots` — the filtering happens server-side via Prisma `where` clauses, not client-side on the full dataset
- The `ShotChart.tsx` component itself stays a pure renderer (receives filtered `shots[]`). The filter controls live in the page-level client component (`ShotChartPageClient.tsx`) which manages state and calls the API with updated params via TanStack Query

### 4. Plus/Minus Impact
- Horizontal bar chart, sorted by +/-
- Green/red (or gold/purple) for positive/negative
- On/Off court net rating comparison panel

## Communication Rules
- You write ONLY to: `src/app/`, `src/components/`, `src/lib/`, `tailwind.config.ts`, `e2e/`, `playwright.config.ts`, `tasks/status/worker-4.md`
- You do NOT write API routes, ETL scripts, or modify the Prisma schema.
- You MUST read `tasks/handoffs/api-contracts.md` to know exact API endpoints, params, and response shapes.
- Use the response shapes from the contracts to build TypeScript types.
- If an API endpoint you need doesn't exist in the contracts, flag it as a BLOCKER — the Planner will assign it to Worker 3.
- Add `data-testid` attributes to all interactive elements (filter dropdowns, toggle buttons, stat cards, chart containers) so Playwright E2E tests can reliably select them.
- In Phase 5, write Playwright E2E tests in `e2e/` covering: page loads with real data, shot chart filtering (player, game, quarter, shot type), trend chart metric/window toggles, navigation between pages, and data rendering assertions. Also write `playwright.config.ts`. See Part 6 for test specifications.
```

---

## Part 4: Running the Orchestration

### Step-by-step in Claude Code

1. **Open your terminal** and paste the **Main Prompt** into Claude Code.
2. Claude Code will scaffold the project and spawn the Planner.
3. The Planner will write initial tasks to `tasks/BOARD.md` and spawn Worker 1.
4. **Worker 1** creates the Prisma schema → writes `tasks/handoffs/db-schema.md`.
5. **Planner** detects the handoff → spawns Workers 2 and 3 in parallel.
6. **Worker 2** builds ETL scripts. **Worker 3** builds API routes → writes `tasks/handoffs/api-contracts.md`.
7. **Planner** detects API contracts → spawns Worker 4.
8. **Worker 4** builds the frontend consuming the documented API.
9. **Planner** runs final build verification and marks COMPLETE.

### How to spawn agents in Claude Code

Use the `/run` command or the Task tool to spawn each agent in a separate context:

```bash
# In your main Claude Code session:
claude --print "You are the Planner Agent. [paste planner prompt]"

# The planner then instructs you to run:
claude --print "You are Worker 1. [paste worker 1 prompt]"
```

Or use Claude Code's built-in subagent/task capabilities if available in your version.

### Monitoring Progress

Watch the `tasks/` directory:
```bash
# In a separate terminal
watch -n 5 'cat tasks/BOARD.md && echo "---" && cat tasks/status/*.md'
```

---

## Part 6: Testing Strategy

All three test layers run against a **real PostgreSQL test database** seeded with known data. No mocks for the database — every test validates the actual data path.

### Test Database Setup

```bash
# .env.test
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nba_analytics_test"
```

Before each test suite, reset and seed the test database:
```bash
npx prisma db push --force-reset
npx tsx scripts/seed-test-data.ts
```

The seed script (`scripts/seed-test-data.ts`) inserts a fixed, minimal dataset:
- 2 teams (Lakers + one opponent)
- 5 players per team
- 10 games with box scores
- 50 shot chart entries (mix of makes/misses, zones, periods)
- Team efficiency snapshots for 3 windows
- Standings for both conferences

This seed data is deterministic — tests can assert exact values.

---

### Layer 1: ETL Validation (pytest)

**Owner:** Worker 2
**Location:** `etl/tests/`
**Run:** `cd etl && python -m pytest tests/ -v`

```
etl/tests/
├── conftest.py                  # DB connection fixture, test season/team constants
├── test_fetch_teams.py          # Verify all 30 teams upserted, no duplicates
├── test_fetch_players.py        # Verify player records match roster count
├── test_fetch_game_logs.py      # Verify game log column completeness, no nulls on required fields
├── test_fetch_shots.py          # Verify ALL 15 ShotChartDetail fields are stored (critical)
├── test_fetch_efficiency.py     # Verify both TeamGameEfficiency + TeamEfficiencySnapshot tables populated
├── test_fetch_standings.py      # Verify 30 rows, correct conference assignment
└── test_upsert_idempotency.py   # Run the same ETL twice, verify no duplicate rows
```

**Key test cases:**

```python
# test_fetch_shots.py
def test_shot_chart_has_all_filter_fields(db_connection):
    """Every shot record must have all fields needed for frontend filtering."""
    required_columns = [
        'game_id', 'game_date', 'player_id', 'team_id',
        'period', 'minutes_remaining', 'seconds_remaining',
        'action_type', 'shot_type', 'shot_zone', 'shot_area',
        'shot_distance', 'location_x', 'location_y', 'made'
    ]
    result = db_connection.execute("SELECT * FROM shot_charts LIMIT 1")
    row = result.fetchone()
    for col in required_columns:
        assert getattr(row, col) is not None, f"ShotChart column '{col}' is NULL — frontend filters will break"

def test_shot_chart_no_dropped_columns(db_connection):
    """Verify no ShotChartDetail columns were discarded during ETL."""
    result = db_connection.execute("SELECT COUNT(*) FROM shot_charts WHERE period IS NULL")
    assert result.scalar() == 0, "period column has NULLs — quarter filter will break"

    result = db_connection.execute("SELECT COUNT(*) FROM shot_charts WHERE action_type IS NULL")
    assert result.scalar() == 0, "action_type column has NULLs — shot type filter will break"

# test_upsert_idempotency.py
def test_double_run_no_duplicates(db_connection, run_etl):
    """Running ETL twice must produce the same row count."""
    run_etl()  # first run
    count_1 = db_connection.execute("SELECT COUNT(*) FROM player_game_logs").scalar()
    run_etl()  # second run
    count_2 = db_connection.execute("SELECT COUNT(*) FROM player_game_logs").scalar()
    assert count_1 == count_2, f"Duplicate rows created: {count_1} → {count_2}"

# test_fetch_efficiency.py
def test_efficiency_estimates_reasonable(db_connection):
    """Estimated OffRtg/DefRtg should be within NBA-realistic range (85-135)."""
    result = db_connection.execute(
        "SELECT MIN(est_off_rating), MAX(est_off_rating), MIN(est_def_rating), MAX(est_def_rating) FROM team_game_efficiency"
    )
    min_off, max_off, min_def, max_def = result.fetchone()
    assert 85 < min_off < 135, f"OffRtg out of range: {min_off}"
    assert 85 < max_off < 135, f"OffRtg out of range: {max_off}"
    assert 85 < min_def < 135, f"DefRtg out of range: {min_def}"
    assert 85 < max_def < 135, f"DefRtg out of range: {max_def}"
```

---

### Layer 2: Unit Tests (Vitest)

**Owner:** Worker 3
**Location:** `src/__tests__/`
**Run:** `npx vitest run`

```
src/__tests__/
├── setup.ts                     # Prisma test client, DB reset helper
├── api/
│   ├── teams.test.ts            # GET /api/teams, GET /api/teams/:teamId
│   ├── team-stats.test.ts       # GET /api/teams/:teamId/stats — verify response shape, Four Factors
│   ├── team-shots.test.ts       # GET /api/teams/:teamId/shots — verify player/game filter params
│   ├── players.test.ts          # GET /api/players, search, team filtering
│   ├── player-gamelog.test.ts   # GET /api/players/:playerId/gamelog — last N, date range
│   ├── player-shots.test.ts     # GET /api/players/:playerId/shots — game/period/type filters
│   ├── player-trends.test.ts    # GET /api/players/:playerId/trends — rolling avg calculation
│   ├── standings.test.ts        # GET /api/standings — conference filter
│   └── league-leaders.test.ts   # GET /api/league/leaders — stat sorting
└── lib/
    ├── response.test.ts         # Verify success/error response shape helpers
    └── validation.test.ts       # Zod schema validation edge cases
```

**Key test patterns:**

```typescript
// src/__tests__/api/team-shots.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { prisma } from '@/app/api/_lib/prisma'

describe('GET /api/teams/:teamId/shots', () => {
  it('returns all shots for a team with metadata arrays', async () => {
    const res = await fetch('/api/teams/1610612747/shots?season=2025-26')
    const json = await res.json()

    expect(json.success).toBe(true)
    expect(json.data.length).toBeGreaterThan(0)
    expect(json.meta.players).toBeInstanceOf(Array)
    expect(json.meta.players[0]).toHaveProperty('playerId')
    expect(json.meta.players[0]).toHaveProperty('playerName')
    expect(json.meta.games).toBeInstanceOf(Array)
    expect(json.meta.games[0]).toHaveProperty('gameId')
    expect(json.meta.games[0]).toHaveProperty('gameDate')
  })

  it('filters by playerId', async () => {
    const res = await fetch('/api/teams/1610612747/shots?season=2025-26&playerId=2544')
    const json = await res.json()

    json.data.forEach((shot: any) => {
      expect(shot.playerId).toBe('2544')
    })
  })

  it('filters by gameId', async () => {
    const gameId = '0022501024'
    const res = await fetch(`/api/teams/1610612747/shots?season=2025-26&gameId=${gameId}`)
    const json = await res.json()

    json.data.forEach((shot: any) => {
      expect(shot.gameId).toBe(gameId)
    })
  })

  it('filters by period', async () => {
    const res = await fetch('/api/teams/1610612747/shots?season=2025-26&period=4')
    const json = await res.json()

    json.data.forEach((shot: any) => {
      expect(shot.period).toBe(4)
    })
  })
})

// src/__tests__/api/player-trends.test.ts
describe('GET /api/players/:playerId/trends', () => {
  it('returns rolling averages with correct window size', async () => {
    const res = await fetch('/api/players/2544/trends?metric=pts&window=5&season=2025-26')
    const json = await res.json()

    expect(json.data.length).toBeGreaterThan(0)
    expect(json.data[0]).toHaveProperty('gameDate')
    expect(json.data[0]).toHaveProperty('value')
    expect(json.data[0]).toHaveProperty('rollingAvg')
    // First 4 entries should have null rollingAvg (not enough data for window of 5)
    expect(json.data[0].rollingAvg).toBeNull()
    expect(json.data[4].rollingAvg).toBeTypeOf('number')
  })

  it('returns 400 for invalid metric', async () => {
    const res = await fetch('/api/players/2544/trends?metric=invalid&window=5&season=2025-26')
    expect(res.status).toBe(400)
  })
})

// src/__tests__/lib/response.test.ts
describe('API response helpers', () => {
  it('success response matches contract shape', () => {
    const res = successResponse([], { total: 0, page: 1, pageSize: 25 })
    expect(res).toEqual({
      success: true,
      data: [],
      meta: { total: 0, page: 1, pageSize: 25 }
    })
  })

  it('error response matches contract shape', () => {
    const res = errorResponse('NOT_FOUND', 'Team not found')
    expect(res).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Team not found' }
    })
  })
})
```

**Vitest config:**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    env: {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/nba_analytics_test',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

---

### Layer 3: E2E Tests (Playwright)

**Owner:** Worker 4
**Location:** `e2e/`
**Run:** `npx playwright test`

E2E tests run against `npm run dev` with the test database. They exercise the **full stack**: browser → Next.js frontend → API routes → Prisma → PostgreSQL → back up.

```
e2e/
├── fixtures/
│   └── seed.ts                  # Shared seed helper (calls scripts/seed-test-data.ts)
├── team-dashboard.spec.ts       # Team overview page loads, stat cards render
├── team-roster.spec.ts          # Roster table renders, sorting works
├── team-games.spec.ts           # Game log table renders with real data
├── team-shots.spec.ts           # Team shot chart with player + game filters
├── player-dashboard.spec.ts     # Player page loads, trend chart renders
├── player-shots.spec.ts         # Player shot chart with game + quarter filters
├── player-trends.spec.ts        # Trend chart responds to metric/window toggles
├── standings.spec.ts            # Standings page loads both conferences
└── navigation.spec.ts           # Sidebar links, team selector, breadcrumbs
```

**Key test cases:**

```typescript
// e2e/team-shots.spec.ts
import { test, expect } from '@playwright/test'

const LAKERS_ID = '1610612747'

test.describe('Team Shot Chart', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/teams/${LAKERS_ID}/shots`)
  })

  test('renders shot chart with dots on the court', async ({ page }) => {
    // Wait for shot data to load
    await expect(page.locator('svg circle').first()).toBeVisible()
    const dots = page.locator('svg circle[fill="#FDB927"], svg circle[fill="#552583"]')
    expect(await dots.count()).toBeGreaterThan(0)
  })

  test('filter by player updates the court and stats', async ({ page }) => {
    // Get initial shot count
    const initialCount = await page.locator('svg circle[opacity]').count()

    // Select a specific player from dropdown
    await page.locator('[data-testid="player-filter"]').selectOption({ index: 1 })
    await page.waitForResponse(resp => resp.url().includes('/shots'))

    // Shot count should change (filtered to one player)
    const filteredCount = await page.locator('svg circle[opacity]').count()
    expect(filteredCount).toBeLessThan(initialCount)
  })

  test('filter by game shows only that game\'s shots', async ({ page }) => {
    // Select a specific game from dropdown
    await page.locator('[data-testid="game-filter"]').selectOption({ index: 1 })
    await page.waitForResponse(resp => resp.url().includes('/shots'))

    // Verify shots loaded
    const dots = page.locator('svg circle[opacity]')
    expect(await dots.count()).toBeGreaterThan(0)

    // Stats summary should update
    await expect(page.locator('[data-testid="shot-count"]')).not.toHaveText('0')
  })

  test('quarter filter buttons work', async ({ page }) => {
    await page.locator('[data-testid="period-filter-4"]').click()
    await page.waitForResponse(resp => resp.url().includes('period=4'))

    const dots = page.locator('svg circle[opacity]')
    expect(await dots.count()).toBeGreaterThan(0)
  })

  test('made/missed toggle filters the dots', async ({ page }) => {
    await page.locator('button', { hasText: 'made' }).click()

    // All visible dots should be gold (made)
    const goldDots = page.locator('svg circle[fill="#FDB927"]')
    const purpleDots = page.locator('svg circle[fill="#552583"]')
    expect(await goldDots.count()).toBeGreaterThan(0)
    expect(await purpleDots.count()).toBe(0)
  })
})

// e2e/player-trends.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Player Trend Chart', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/players/2544')  // LeBron
  })

  test('trend chart renders with default metric', async ({ page }) => {
    // Chart should have SVG elements from Recharts
    await expect(page.locator('.recharts-responsive-container')).toBeVisible()
    // Should have data points
    await expect(page.locator('.recharts-dot').first()).toBeVisible()
  })

  test('changing metric re-fetches and re-renders chart', async ({ page }) => {
    // Switch to FG%
    await page.locator('[data-testid="metric-selector"]').selectOption('fg_pct')
    await page.waitForResponse(resp => resp.url().includes('metric=fg_pct'))

    // Chart should still render
    await expect(page.locator('.recharts-responsive-container')).toBeVisible()
  })

  test('window toggle changes the rolling average line', async ({ page }) => {
    await page.locator('[data-testid="window-10"]').click()
    await page.waitForResponse(resp => resp.url().includes('window=10'))

    await expect(page.locator('.recharts-responsive-container')).toBeVisible()
  })
})

// e2e/team-dashboard.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Team Dashboard', () => {
  test('loads Lakers dashboard with real data from DB', async ({ page }) => {
    await page.goto('/teams/1610612747')

    // Stat cards should show real values (not loading skeletons)
    await expect(page.locator('[data-testid="stat-card-record"]')).toBeVisible()
    await expect(page.locator('[data-testid="stat-card-record"]')).not.toHaveText('--')

    // Four Factors panel should have values
    await expect(page.locator('[data-testid="stat-efg-pct"]')).toBeVisible()
  })

  test('efficiency trend chart renders with data points', async ({ page }) => {
    await page.goto('/teams/1610612747')

    await expect(page.locator('.recharts-responsive-container').first()).toBeVisible()
  })

  test('navigating to roster loads player table', async ({ page }) => {
    await page.goto('/teams/1610612747')
    await page.locator('a', { hasText: 'Roster' }).click()

    await expect(page).toHaveURL(/\/roster/)
    // Table should have player rows
    await expect(page.locator('table tbody tr').first()).toBeVisible()
  })
})

// e2e/navigation.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test('home page team selector navigates to team dashboard', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="team-card-1610612747"]').click()
    await expect(page).toHaveURL(/\/teams\/1610612747/)
  })

  test('sidebar player links navigate to player dashboard', async ({ page }) => {
    await page.goto('/teams/1610612747')
    await page.locator('a', { hasText: 'LeBron' }).click()
    await expect(page).toHaveURL(/\/players\/2544/)
  })
})
```

**Playwright config:**

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/nba_analytics_test',
    },
  },
})
```

---

### What Each Test Layer Catches

| Failure | ETL (pytest) | Unit (Vitest) | E2E (Playwright) |
|---|---|---|---|
| ETL drops a ShotChartDetail column | **YES** — `test_shot_chart_has_all_filter_fields` | No | No (no data to render) |
| ETL creates duplicate rows on re-run | **YES** — `test_upsert_idempotency` | No | No |
| Efficiency estimates out of range | **YES** — `test_efficiency_estimates_reasonable` | No | No |
| API returns wrong response shape | No | **YES** — response shape assertions | Indirectly (render fails) |
| API filter param ignored | No | **YES** — `filters by playerId` etc. | **YES** — filter UI assertions |
| Zod rejects valid input | No | **YES** — validation edge cases | No |
| Shot chart doesn't render dots | No | No | **YES** — `svg circle` count |
| Game filter dropdown doesn't populate | No | No | **YES** — `selectOption` test |
| Trend chart doesn't update on toggle | No | No | **YES** — `waitForResponse` + re-render |
| Navigation between pages broken | No | No | **YES** — URL assertions |
| DB read returns empty when data exists | No | **YES** — Prisma query tests | **YES** — "not loading" assertions |

---

### Running All Tests

```bash
# 1. Reset test database and seed
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nba_analytics_test" npx prisma db push --force-reset
npx tsx scripts/seed-test-data.ts

# 2. ETL validation
cd etl && source ../etl-env/bin/activate && python -m pytest tests/ -v && cd ..

# 3. Unit tests
npx vitest run

# 4. E2E tests (starts dev server automatically via playwright.config.ts webServer)
npx playwright test

# Or run all three in sequence:
npm run test:all
```

Add to `package.json`:
```json
{
  "scripts": {
    "test:etl": "cd etl && python -m pytest tests/ -v",
    "test:unit": "vitest run",
    "test:e2e": "playwright test",
    "test:all": "npm run test:etl && npm run test:unit && npm run test:e2e"
  }
}
```

---

## Part 5: Future Enhancements

Once the base dashboard is running, potential additions include:
- **Live game tracking** via `nba_api.live.nba.endpoints.scoreboard`
- **Player comparison tool** (side-by-side radar charts)
- **Injury impact analysis** (performance before/after teammate injuries)
- **Predictive models** (win probability, player projection using sklearn)
- **Lineup optimizer** (which 5-man combos produce the best net rating)
- **Trade impact simulator** (swap players between teams, project new stats)
- **Supabase Realtime** for live dashboard updates during games
- **Vercel deployment** with ISR (Incremental Static Regeneration) for fast loads