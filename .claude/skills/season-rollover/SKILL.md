---
name: season-rollover
description: Checklist for starting a new NBA season or absorbing a big roster change in the Lakers analytics project — season constants, backfilling the final previous season, refreshing rosters and verifying newcomer baselines. Use when a new season begins, the dashboard shows the wrong season, or players changed teams.
---

# Season rollover

The current season is **derived from the date** (Oct 1 rollover, US Eastern time) in two places that must agree:

- `nba-analytics/etl/config.py` → `CURRENT_SEASON_YEAR` (override: `NBA_SEASON=2026-27`)
- `nba-analytics/src/lib/constants.ts` → `CURRENT_SEASON` (override: `NEXT_PUBLIC_NBA_SEASON=2026-27`)

`PREVIOUS_SEASON` is computed from it. Nothing else should hard-code a season string —
grep before you finish: `grep -rn '"20[0-9][0-9]-[0-9][0-9]"' nba-analytics/src --include=*.ts*`
(test fixtures and `scripts/` are fine).

## Checklist

1. **Confirm the season** — `etl-env/bin/python -c "import sys; sys.path.insert(0,'etl'); import config; print(config.CURRENT_SEASON_YEAR, config.PREVIOUS_SEASON_YEAR)"`.
2. **Last season's baselines** — newcomer baselines read last season's `PlayerSeasonStats`
   league-wide. `refresh.py` fetches them automatically (2 calls); no game backfill needed.
3. **Refresh rosters + current season** — `etl-env/bin/python etl/refresh.py`.
   Rosters come from `CommonTeamRoster` for all 30 teams, which moves traded/signed players
   (`Player.teamId`) to their new team.
4. **Verify newcomer classification** on `/` — every player should show `Returning`, `New`
   (with prior team) or `Rookie`. A veteran showing `Rookie` means last season's stats are
   missing for them → re-run step 2.
5. **Season row** — `SELECT id, "isCurrent" FROM "Season"`: exactly one `isCurrent = true`.
   `ensure_seasons()` in `etl/utils.py` maintains it.
6. **Tests** — bump `SEASON` in `src/__tests__/setup.ts` / `etl/tests/conftest.py` only if
   the fixtures were re-seeded for the new season; the demo seed always uses `CURRENT_SEASON`.
7. **Early-season expectations** — for the first ~10 games the projection regresses ratings
   toward league average and players with <5 games show their previous-season line. That is
   intended; see `basketball-metrics`.
