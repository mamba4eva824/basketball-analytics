---
name: refresh-nba-data
description: Pull fresh NBA data into Postgres with the Python ETL (nba_api / stats.nba.com, plus optional ESPN injuries), debug ETL failures, or add a new fetcher. Use when the dashboards look stale, after games are played, when a fetch errors or is rate-limited, or when adding a new data source/table.
---

# Refresh NBA data

Run from `nba-analytics/`. One-time setup:

```bash
python3 -m venv etl-env
etl-env/bin/pip install nba_api pandas sqlalchemy "psycopg[binary]" psycopg2-binary python-dotenv pytest
```

## Daily refresh (what the dashboards need)

```bash
etl-env/bin/python etl/refresh.py                 # current season, all 30 teams (~45 calls, ~1–2 min)
etl-env/bin/python etl/refresh.py --skip-injuries # if ESPN is unreachable
```

Scope is **the current season only**. `refresh.py` also pulls last season's player season stats
(2 calls) for newcomer baselines; don't backfill previous-season games unless asked.

**Run it from a home connection.** stats.nba.com / cdn.nba.com refuse cloud and datacenter IPs —
Claude cloud sessions get an empty reply even with the domains allowlisted. Point `DATABASE_URL`
at Supabase (session pooler, see `nba-analytics/.env.example`) so the data lands in the shared
database rather than a throwaway container.

`refresh.py` uses league-wide endpoints so every opponent is covered for a handful of calls:

| Step | Endpoint (calls) | Table(s) |
|------|------------------|----------|
| Teams + seasons | static teams (0) | `Team`, `Season` |
| Rosters | `CommonTeamRoster` ×30 (always current rosters) | `Player` (moves traded players) |
| Schedule | `ScheduleLeagueV2` ×1 — drops preseason/All-Star, keeps play-in + NBA Cup final, skips TBD playoff slots | `ScheduledGame` |
| Team games | `LeagueGameLog` (T) ×1 | `GameBoxScore` |
| Player games | `LeagueGameLog` (P) ×1 | `PlayerGameLog` |
| Starters | `BoxScoreTraditionalV3` × focus-team games not yet flagged (flags both teams; a past season's first run ≈ 82 calls — use `--skip-starters` for backfills) | `PlayerGameLog.started` |
| Player seasons | `LeagueDashPlayerStats` Base+Advanced ×2 per season (current + previous) | `PlayerSeasonStats` |
| Team seasons + standings | `LeagueDashTeamStats` ×4 + `LeagueStandings` ×1 | `TeamSeasonStats`, `Standing` |
| Lineups | `TeamDashLineups` (focus team) | `LineupStats` |
| Injuries (optional) | ESPN site API ×1 | `PlayerInjury` |

The full multi-season backfill (`etl/run_all.py`) is still available but makes hundreds of
per-player calls — use it only for history.

## Rules for fetchers

- Always call stats.nba.com through `utils.safe_call()` (throttle + retries). Never loop
  without it — stats.nba.com bans aggressive clients for hours.
- Put response → row mapping in a pure `transform_*(df, ...) -> list[dict]` function and
  unit-test it in `etl/tests/unit/` with a hand-built DataFrame. DB writes go through
  `utils.upsert_rows()` (idempotent on the model's unique key).
- Rows referencing `Player`/`Team` must be filtered to IDs that exist (FK safety):
  league-wide endpoints include players who are no longer on a roster.
- Percentages → 0–1 decimals via `pct_to_decimal()`.
- Schema changes go in `prisma/schema.prisma` first, then `npx prisma db push`.
- Never `str()` an ID read from `iterrows()` — use `str(safe_int(...))`. An all-numeric frame
  upcasts to float and yields `'1610612747.0'`.
- Upserts must not clobber enrichment: `PLAYER_LOG_COLUMNS` deliberately omits `started` and
  the advanced fields so later steps' values survive a re-run.

## Troubleshooting

- **Reading the summary**: `refresh.py` ends with a step table. `empty` = the step ran but wrote
  0 rows (older fetchers swallow API errors — check their log lines); `failed` = it raised.
  Exit code 1 means a required step failed (injuries are optional).

- **Timeouts / "Empty reply from server" from stats.nba.com**: the site blocks cloud IPs. Run from
  a residential connection. Retrying harder makes it worse.
- **`could not translate host name` / IPv6 errors to Supabase**: you used the direct connection
  (`db.<ref>.supabase.co`, IPv6-only on free tier). Use the Session pooler string instead.
- **`ReadTimeout` on one team**: `safe_call` retries 3×; re-run `refresh.py` — it is idempotent.
- **Injuries panel empty**: ESPN changed its JSON or is unreachable — the fetcher logs and
  skips (a fetch that parses 0 rows keeps the previous snapshot); the rest of the refresh is unaffected.
- **Duplicate / missing games**: `SELECT season, count(*) FROM "GameBoxScore" GROUP BY 1`
  (a full regular season is 1,230 games).
