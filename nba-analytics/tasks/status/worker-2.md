# Worker 2 — ETL / Data Pipeline Engineer

## Status: COMPLETE

### Completed Tasks

1. **`etl/config.py`** — Database URL, NBA constants, all 30 team metadata (conference, division, colors), season helpers
2. **`etl/utils.py`** — DB connection (SQLAlchemy), rate-limited `safe_call()`, retry logic, upsert builder, type conversion helpers, CUID generator
3. **`etl/fetch_teams.py`** — Populates `Team`, `Player`, `Season` tables from `nba_api.stats.static.teams` + `CommonTeamRoster`
4. **`etl/fetch_players.py`** — Enriches `Player` with draft/bio via `CommonPlayerInfo`; populates `PlayerSeasonStats` via `LeagueDashPlayerStats` (Base + Advanced)
5. **`etl/fetch_game_logs.py`** — Populates `GameBoxScore` (team-level) via `TeamGameLog` and `PlayerGameLog` (individual) via `PlayerGameLog` endpoint
6. **`etl/fetch_advanced.py`** — Populates `LineupStats` via `TeamDashLineups`; enriches `PlayerGameLog` with advanced stats via `BoxScoreAdvancedV2`
7. **`etl/fetch_efficiency.py`** — Populates `TeamGameEfficiency` (estimated from box score data) and `TeamEfficiencySnapshot` (official windowed ratings from `LeagueDashTeamStats`)
8. **`etl/fetch_shots.py`** — Populates `ShotChart` via `ShotChartDetail`
9. **`etl/fetch_standings.py`** — Populates `Standing` via `LeagueStandings` and `TeamSeasonStats` via `LeagueDashTeamStats` (Base + Advanced + Misc + Opponent)
10. **`etl/run_all.py`** — Full backfill orchestrator with CLI args (`--team`, `--current-only`, `--skip-shots`)
11. **`etl/run_incremental.py`** — Daily incremental update orchestrator with CLI args (`--team`, `--days`)

### Handoff Written
- `tasks/handoffs/etl-tables.md` — Complete script-to-table mapping, dependency order, upsert keys, usage examples

### Key Design Decisions
- All 11 Prisma models are covered by the ETL pipeline
- Upsert (ON CONFLICT DO UPDATE) used throughout for idempotent re-runs
- Rate limiting: 0.6s delay between API calls + exponential backoff retry (3 attempts)
- Column names match Prisma schema exactly (camelCase, quoted in SQL)
- Percentages stored as 0.0-1.0 decimals
- CUID-like IDs generated for tables that need them
- ShotChart uses delete+re-insert strategy (no natural unique key per shot)
- Efficiency ratings estimated from box score using standard possession formula
- Full backfill covers 5 seasons (2021-22 through 2025-26) for all 30 teams
- Incremental mode only processes current season

### Blockers
- None. All table and column names verified against Prisma schema.

### Environment
- Python 3.13.3 in `etl-env/` virtualenv
- Dependencies: `nba_api==1.11.4`, `SQLAlchemy==2.0.48`, `psycopg2-binary==2.9.11`, `python-dotenv==1.2.2`
- DATABASE_URL: `postgresql://postgres:postgres@localhost:5432/nba_analytics`
