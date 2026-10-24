---
name: basketball-metrics
description: Definitions, formulas, rank directions, small-sample thresholds and the matchup projection model used by the Lakers dashboards. Use before adding or changing any metric, rank, chart value, threshold or projection in nba-analytics/src/lib/analytics, the dashboard/matchup API routes, or the ETL.
---

# Basketball metrics — the spec the code implements

Implementation: `nba-analytics/src/lib/analytics/` (pure functions, unit-tested in
`nba-analytics/src/__tests__/lib/`). If you change a formula here, change the code and the
tests in the same commit — and vice versa.

## Storage conventions

- Percentages: decimals 0–1 (`0.534`, never `53.4`). Format with `fmtPct()` at render time.
- Ratings: points per 100 possessions. Pace: possessions per game (not per 48 — box scores carry no minutes).
- Season strings: `"2026-27"` (start year + 2-digit end year).

## Team metrics (box-score derived, `teamProfiles.ts`)

All team metrics are computed from `GameBoxScore` rows so every team, every window
(season, last 10, last 5) is measured the same way. **Aggregate totals first, then divide** —
never average per-game ratios.

| Metric        | Formula                                                    | Better |
|---------------|------------------------------------------------------------|--------|
| Possessions   | `FGA + 0.44·FTA − OREB + TOV` (per team; game poss = mean of both teams) | — |
| Pace          | game possessions (box scores carry no minutes, so OT games read slightly high) | — |
| ORtg          | `100 · PTS / poss`                                         | higher |
| DRtg          | `100 · oppPTS / poss`                                      | lower  |
| Net Rtg       | `ORtg − DRtg`                                              | higher |
| eFG%          | `(FGM + 0.5·3PM) / FGA`                                    | higher |
| TOV%          | `TOV / (FGA + 0.44·FTA + TOV)`                             | lower  |
| OREB%         | `OREB / (OREB + opp DREB)`                                 | higher |
| FT rate       | `FTA / FGA` (NBA.com "FTA Rate")                           | higher |
| 3PA rate      | `3PA / FGA`                                                | —      |
| Opp eFG% / Opp TOV% / Opp OREB% / Opp FT rate | same formulas from the opponent's side | lower / higher / lower / lower |

If OREB/DREB are null for any game in a window, OREB% for that window is `null` (shown "—").
Possessions need OREB, so a game missing it is **excluded** from ORtg/DRtg/Net/pace (ratings are
computed over the games where possessions are measurable; `null` if none) — never treat a
missing OREB as 0.
These are estimates; they differ from NBA.com's official ratings by ~0.5 pts. The UI says so
in a tooltip ("box-score estimate").

## Ranks (`ranks.ts`)

- `rankTeams(values, direction)` → 1 = best among teams with a non-null value; ties share
  the lower rank (1, 2, 2, 4). Direction comes from the "Better" column above
  (`METRIC_DIRECTION` in code). Teams with 0 games are excluded.
- Display: `3rd`, colour-coded top-10 green / bottom-10 red.

## Small-sample policy

- Team: `gamesPlayed < 5` → "small sample" badge on ratings and on the projection.
- Player: `gamesPlayed < 5` this season → show the previous-season line next to the current
  one ("2025-26 w/ UTA: 11.4 / 9.8 / 2.1"). Previous-season stats come from
  `PlayerSeasonStats` for `PREVIOUS_SEASON`, any team.

## Roster classification (`roster.ts`)

| Status      | Rule                                                                              |
|-------------|-----------------------------------------------------------------------------------|
| `returning` | Has a `PlayerSeasonStats` row with the focus team in `PREVIOUS_SEASON`             |
| `new`       | Has a previous-season row with another team (baseline = that row, team shown)    |
| `rookie`    | No previous-season row and (`fromYear` = current start year or `fromYear` null)  |
| `new`       | No previous-season row but has earlier NBA seasons (returning from injury/overseas) |

### Games started (`gamesStartedByPlayer`)

`LeagueDashPlayerStats` has no GS column, so `PlayerSeasonStats.gamesStarted` is always 0 — never
read it. Count `PlayerGameLog.started` per player/team/season instead. Starters are only flagged for
focus-team games (both sides), so the count is shown only when every one of the player's games has
5 flagged starters for their team; otherwise (other teams' games, last season) show "—".

## Player form (`form.ts`)

- Last-N averages are simple means over games played (DNPs excluded).
- TS% from logs: `PTS / (2 · (FGA + 0.44·FTA))`, aggregated over the window.
- Trend arrow compares last-5 average to season average: ±10 % → ▲/▼, otherwise flat.

## Starting lineups (`lineups.ts`)

Group the focus team's games by the sorted set of 5 player IDs with `started = true`
in `PlayerGameLog`. Games without exactly 5 starters are skipped (and counted in
`gamesMissingStarterData`). Report games, W-L, and avg point differential per unit.

## Plus-minus trend (`plusMinus.ts`)

Per-player +/- across the season, built so injuries don't distort it:

- **Team-game axis.** Every team game is a slot: `played` (minutes > 0 and a +/- value),
  `missed`, or `not-with-team` (on/before the player's last game for another team this
  season — mid-season arrivals aren't charged with missed games).
- **Missed games are gaps, never zeros.** The moving average covers the last N games
  *played* (N = 5 or 10). Zero-filling would pull the line toward 0 during an absence
  ("flattening"); a gap leaves it where the player's real level was.
- **Per 36:** `36 · Σ(+/-) / Σ(minutes)` over the same window — minutes-weighted, so a
  minutes-limited return game doesn't swing the average like a full game would.
- **Absences** are contiguous missed slots. The trailing one is `ongoing`. Its `kind` is
  `injury` only with evidence (injury report or an injury-like DNP reason), `other` for
  rest/coach's decision, else `unknown`: a box score can't tell an injury from a
  healthy scratch, so the UI says "Missed", not "Out", without evidence.
- **Trend:** last-window average vs season average, ±3 points (not a ratio — +/- crosses 0).
  Needs more games played than the window.
- +/- is lineup- and opponent-dependent noise at the single-game level; present it as a
  trend, never as a player-value rating.

## Matchup projection (`projection.ts`)

A deliberately simple, explainable efficiency model — label it "estimate", never "prediction":

1. **Regress to the mean** (early season): `adj = (gp·x + K·leagueAvg) / (gp + K)`, `K = 10`,
   applied to ORtg, DRtg and pace.
2. **Expected pace**: `paceA · paceB / leaguePace`.
3. **Expected efficiency**: `ORtgA_exp = adjORtgA + adjDRtgB − leagueORtg` (and vice versa).
4. **Points**: `pace_exp · ORtg_exp / 100`, then home court: `+1.0` to home, `−1.0` to away
   (≈2-point home margin).
5. **Win probability**: `Φ(margin / 12)` (normal CDF, σ = 12 points).

## Four-factor edges (`matchup.ts`)

For each factor, compare **our offensive rank** with **their defensive rank** of the same
factor (and our defense vs their offense):

- `rankGap = theirRank − ourRank` (positive = we rank better).
- `rankGap ≥ 6` → `advantage`, `rankGap ≤ −6` → `disadvantage`, otherwise `even`.

## Things that are NOT available — don't fake them

- On/off splits, tracking data, and real per-game possessions are not ingested.
- `PlayerSeasonStats.per` actually holds NBA.com **PIE**; label it PIE.
- `PlayerSeasonStats.gamesStarted` is always 0 (no GS in the endpoint); see "Games started".
- Injury data is unofficial (ESPN) and may lag; always show its `fetchedAt` time.
