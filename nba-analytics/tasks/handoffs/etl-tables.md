# ETL Pipeline — Table Population Map

> Generated: 2026-03-21
> Author: Worker 2 (ETL / Data Pipeline Engineer)

---

## Script-to-Table Mapping

| Script | Tables Populated | Data Source |
|--------|-----------------|-------------|
| `fetch_teams.py` | **Team**, **Player**, **Season** | `nba_api.stats.static.teams`, `CommonTeamRoster` |
| `fetch_players.py` | **Player** (enriched), **PlayerSeasonStats** | `CommonPlayerInfo`, `LeagueDashPlayerStats` (Base + Advanced) |
| `fetch_game_logs.py` | **GameBoxScore**, **PlayerGameLog** | `TeamGameLog`, `PlayerGameLog` |
| `fetch_advanced.py` | **LineupStats**, **PlayerGameLog** (enriched) | `TeamDashLineups`, `BoxScoreAdvancedV2` |
| `fetch_efficiency.py` | **TeamGameEfficiency**, **TeamEfficiencySnapshot** | Computed from `GameBoxScore`, `LeagueDashTeamStats` (Advanced) |
| `fetch_shots.py` | **ShotChart** | `ShotChartDetail` |
| `fetch_standings.py` | **Standing**, **TeamSeasonStats** | `LeagueStandings`, `LeagueDashTeamStats` (Base + Advanced + Misc + Opponent) |

---

## Dependency Order (run_all.py)

```
1. fetch_teams.py       → Team, Season, Player (from rosters)
2. fetch_players.py     → Player (enriched with draft/bio), PlayerSeasonStats
3. fetch_game_logs.py   → GameBoxScore, PlayerGameLog
4. fetch_standings.py   → TeamSeasonStats, Standing
5. fetch_efficiency.py  → TeamGameEfficiency (from GameBoxScore), TeamEfficiencySnapshot
6. fetch_advanced.py    → LineupStats, PlayerGameLog (advanced stats enrichment)
7. fetch_shots.py       → ShotChart
```

---

## All 11 Prisma Models Covered

| Model | Primary Script | Notes |
|-------|---------------|-------|
| `Season` | `fetch_teams.py` | Created first; referenced by all other tables |
| `Team` | `fetch_teams.py` | All 30 NBA teams with conference/division/colors |
| `Player` | `fetch_teams.py` + `fetch_players.py` | Roster data first, then enriched with draft/bio details |
| `GameBoxScore` | `fetch_game_logs.py` | Team-level box score for both home and away |
| `PlayerGameLog` | `fetch_game_logs.py` + `fetch_advanced.py` | Traditional stats first, advanced enrichment second |
| `PlayerSeasonStats` | `fetch_players.py` | Per-game averages + totals + advanced metrics |
| `TeamSeasonStats` | `fetch_standings.py` | Aggregated team metrics including four factors |
| `TeamGameEfficiency` | `fetch_efficiency.py` | Estimated per-game OffRtg/DefRtg from box score |
| `TeamEfficiencySnapshot` | `fetch_efficiency.py` | Official windowed ratings (L5, L10, L15, L20, Season) |
| `ShotChart` | `fetch_shots.py` | Court-coordinate shot data with zones |
| `LineupStats` | `fetch_advanced.py` | 5-man lineup combinations with per-100 stats |
| `Standing` | `fetch_standings.py` | Conference/division standings with splits |

---

## Upsert Strategy

All scripts use `INSERT ... ON CONFLICT DO UPDATE` for idempotent re-runs:

| Table | Conflict Key |
|-------|-------------|
| `Season` | `id` |
| `Team` | `id` |
| `Player` | `id` |
| `GameBoxScore` | `gameId` |
| `PlayerGameLog` | `(playerId, gameId, teamId)` |
| `PlayerSeasonStats` | `(playerId, teamId, season)` |
| `TeamSeasonStats` | `(teamId, season)` |
| `TeamGameEfficiency` | `(teamId, gameId)` |
| `TeamEfficiencySnapshot` | `(teamId, season, window, snapshotDate)` |
| `ShotChart` | Delete+re-insert per (teamId, season, gameId) |
| `LineupStats` | `(teamId, season, lineupKey)` |
| `Standing` | `(teamId, season, asOfDate)` |

---

## Run Modes

### Full Backfill
```bash
source etl-env/bin/activate
python etl/run_all.py                      # All 30 teams, 5 seasons
python etl/run_all.py --team LAL           # Lakers only
python etl/run_all.py --current-only       # Current season only
python etl/run_all.py --skip-shots         # Skip shot chart data
```

### Incremental Daily Update
```bash
source etl-env/bin/activate
python etl/run_incremental.py              # All teams, last 1 day
python etl/run_incremental.py --team LAL   # Lakers only
python etl/run_incremental.py --days 3     # Look back 3 days
```

---

## Column Name Mapping Notes

All SQL uses quoted PascalCase table names and camelCase column names to match Prisma exactly:
```sql
INSERT INTO "TeamGameEfficiency" ("teamId", "gameId", "offRating", ...) VALUES (...)
ON CONFLICT ("teamId", "gameId") DO UPDATE SET ...
```

Percentages are stored as decimals 0.0-1.0 (nba_api returns some as decimals already, some as whole numbers — the `pct_to_decimal()` utility handles both cases).

Enum values match Prisma exactly: `HOME`/`AWAY`, `W`/`L`, `MADE`/`MISSED`, `TWO_POINTER`/`THREE_POINTER`, `EAST`/`WEST`, and all division names.
