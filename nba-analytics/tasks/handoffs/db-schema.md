# Database Schema Handoff — Worker 1

> Generated: 2026-03-21
> Schema: `prisma/schema.prisma`
> Client output: `src/generated/prisma`

---

## Enums

| Enum | Values | Usage |
|------|--------|-------|
| `ShotResult` | `MADE`, `MISSED` | ShotChart |
| `ShotType` | `TWO_POINTER`, `THREE_POINTER` | ShotChart |
| `HomeAway` | `HOME`, `AWAY` | PlayerGameLog, TeamGameEfficiency |
| `WinLoss` | `W`, `L` | PlayerGameLog, TeamGameEfficiency |
| `Conference` | `EAST`, `WEST` | Team |
| `Division` | `ATLANTIC`, `CENTRAL`, `SOUTHEAST`, `NORTHWEST`, `PACIFIC`, `SOUTHWEST` | Team |

---

## Models

### Team
Primary key: `id` (String, NBA team ID e.g. `"1610612747"`)

| Field | Type | Notes |
|-------|------|-------|
| id | String | NBA team ID |
| abbreviation | String | Unique, e.g. "LAL" |
| name | String | Full name |
| city | String | City name |
| nickname | String | e.g. "Lakers" |
| conference | Conference | EAST or WEST |
| division | Division | Team's division |
| logoUrl | String? | URL to team logo |
| primaryColor | String? | Hex color |
| secondaryColor | String? | Hex color |
| createdAt / updatedAt | DateTime | Auto-managed |

**Relations:** Has many Players, GameBoxScores (home/away), PlayerGameLogs, PlayerSeasonStats, TeamSeasonStats, TeamGameEfficiencies, TeamEfficiencySnapshots, ShotCharts, LineupStats, Standings.

---

### Player
Primary key: `id` (String, NBA player ID e.g. `"2544"`)

| Field | Type | Notes |
|-------|------|-------|
| id | String | NBA player ID |
| firstName, lastName, fullName | String | Name fields |
| birthDate | DateTime? | Date of birth |
| height | String? | e.g. "6-9" |
| weight | Int? | Pounds |
| position | String? | e.g. "F", "G-F" |
| jersey | String? | Jersey number |
| isActive | Boolean | Default true |
| fromYear, toYear | Int? | Career span |
| draftYear, draftRound, draftPick | Int? | Draft info |
| country, school | String? | Background |
| headshotUrl | String? | Player photo URL |
| teamId | String? | FK to Team (nullable for free agents) |

**Indexes:** `teamId`, `lastName`, `isActive`

---

### Season
Primary key: `id` (String, e.g. `"2025-26"`)

| Field | Type | Notes |
|-------|------|-------|
| id | String | e.g. "2025-26" |
| startYear, endYear | Int | e.g. 2025, 2026 |
| displayName | String | e.g. "2025-26 Season" |
| startDate, endDate | DateTime? | Season date range |
| isCurrent | Boolean | Flags the active season |

**Relations:** Referenced by nearly all other models via `seasonId`.

---

### GameBoxScore
Primary key: `id` (cuid)
Unique: `gameId`

| Field | Type | Notes |
|-------|------|-------|
| gameId | String | Unique NBA game ID |
| gameDate | DateTime | Game date |
| season | String | "2025-26" display field |
| seasonId | String | FK to Season |
| homeTeamId, awayTeamId | String | FK to Team |
| home/away stats | Int/Float | Full box score both sides |
| arena | String? | Venue name |
| attendance | Int? | Crowd count |
| isPlayoff | Boolean | Playoff flag |
| seriesId | String? | Playoff series grouping |

**Home/Away stat fields:** Points, FGM/FGA/FG%, 3PM/3PA/3P%, FTM/FTA/FT%, OffReb, DefReb, TotalReb, Assists, Steals, Blocks, Turnovers, PersonalFouls, FastBreakPts, PtsInPaint, PtsOffTurnovers, SecondChancePts.

**Indexes:** `gameDate`, `season`, `homeTeamId`, `awayTeamId`, `isPlayoff`

---

### PlayerGameLog
Primary key: `id` (cuid)
Unique: `[playerId, gameId, teamId]`

| Field | Type | Notes |
|-------|------|-------|
| playerId, teamId, gameId | String | Compound unique FK set |
| season, seasonId | String | Season references |
| gameDate | DateTime | For direct querying |
| homeAway | HomeAway | HOME or AWAY |
| result | WinLoss | W or L |
| minutes | Float? | Decimal minutes |
| minutesStr | String? | "35:30" display format |
| Traditional stats | Int | FGM/FGA/FG%, 3PM/3PA/3P%, FTM/FTA/FT%, rebounds, assists, steals, blocks, turnovers, fouls |
| plusMinus | Float? | Game +/- |
| Advanced stats | Float? | OffRtg, DefRtg, NetRtg, AST%, REB%, TS%, eFG%, USG%, Pace, PIR |
| started | Boolean | Starter flag |
| dnp, dnpReason | Boolean/String? | Did Not Play tracking |

**Indexes:** `playerId`, `teamId`, `gameId`, `season`, `gameDate`, `[playerId, season]`

---

### PlayerSeasonStats
Primary key: `id` (cuid)
Unique: `[playerId, teamId, season]`

| Field | Type | Notes |
|-------|------|-------|
| playerId, teamId, seasonId | String | FK references |
| season | String | "2025-26" |
| gamesPlayed, gamesStarted | Int | Volume |
| Per-game averages | Float? | PPG, RPG, APG, etc. |
| Totals | Int? | Total points, rebounds, assists, steals, blocks, turnovers |
| Advanced | Float? | TS%, eFG%, USG%, AST%, REB%, OffRtg, DefRtg, NetRtg, PER, WS, BPM, VORP |

**Indexes:** `playerId`, `teamId`, `season`, `[playerId, season]`

---

### TeamSeasonStats
Primary key: `id` (cuid)
Unique: `[teamId, season]`

| Field | Type | Notes |
|-------|------|-------|
| teamId, seasonId | String | FK references |
| season | String | "2025-26" |
| gamesPlayed, wins, losses, winPct | Int/Float | Record |
| Per-game averages | Float? | PPG, OppPPG, FG%, 3P%, FT%, RPG, APG, SPG, BPG, TOPG |
| Advanced | Float? | OffRtg, DefRtg, NetRtg, Pace, eFG%, TS%, TOV%, OREB%, FTRate, Opponent four-factors |
| Scoring breakdown | Float? | FastBreakPPG, PtsInPaintPPG, PtsOffTurnoversPPG, SecondChancePPG |

**Indexes:** `teamId`, `season`

---

### TeamGameEfficiency
Primary key: `id` (cuid)
Unique: `[teamId, gameId]`

| Field | Type | Notes |
|-------|------|-------|
| teamId, gameId | String | Compound unique |
| season, seasonId | String | Season references |
| gameDate | DateTime | For time-series queries |
| offRating, defRating, netRating | Float? | Estimated per-game ratings |
| pace | Float? | Estimated possessions per 48 |
| possessions | Float? | Raw possessions estimate |
| result | WinLoss? | Game result |
| homeAway | HomeAway? | Home or away |

**Indexes:** `teamId`, `gameId`, `season`, `gameDate`, `[teamId, season]`

---

### TeamEfficiencySnapshot
Primary key: `id` (cuid)
Unique: `[teamId, season, window, snapshotDate]`

| Field | Type | Notes |
|-------|------|-------|
| teamId, seasonId | String | FK references |
| season | String | "2025-26" |
| window | String | "L5", "L10", "L20", "Season" |
| snapshotDate | DateTime | Capture date |
| offRating, defRating, netRating, pace | Float? | Official windowed ratings |
| wins, losses, winPct | Int?/Float? | Window record |
| Four factors | Float? | eFG%, TOV%, OREB%, FTRate + opponent versions |

**Indexes:** `teamId`, `season`, `snapshotDate`, `[teamId, season, window]`

---

### ShotChart
Primary key: `id` (cuid)

| Field | Type | Notes |
|-------|------|-------|
| playerId, teamId, gameId | String | FK references |
| season, seasonId | String | Season references |
| locX, locY | Float | Court coordinates |
| shotZone | String? | e.g. "Restricted Area" |
| shotZoneArea | String? | e.g. "Center(C)" |
| shotZoneRange | String? | e.g. "Less Than 8 ft." |
| shotDistance | Int? | Feet from basket |
| shotType | ShotType | TWO_POINTER or THREE_POINTER |
| shotResult | ShotResult | MADE or MISSED |
| actionType | String? | e.g. "Driving Layup" |
| period | Int? | Quarter 1-4, 5+ for OT |
| gameClock | String? | e.g. "9:45" |
| shotValue | Int? | 2 or 3 |

**Indexes:** `playerId`, `teamId`, `gameId`, `season`, `[playerId, season]`, `[teamId, season]`, `shotZone`, `shotResult`

---

### LineupStats
Primary key: `id` (cuid)
Unique: `[teamId, season, lineupKey]`

| Field | Type | Notes |
|-------|------|-------|
| teamId, seasonId | String | FK references |
| season | String | "2025-26" |
| player1Id..player5Id | String | 5 player IDs in sorted order |
| lineupKey | String | Dash-joined sorted IDs for dedup |
| gamesPlayed | Int | Games lineup appeared in |
| totalMinutes | Float | Minutes together |
| offRating, defRating, netRating, pace | Float? | Per-100-possessions |
| Box stats | Int?/Float? | Points, OppPoints, FGM/FGA/FG%, 3PM/3PA/3P%, FTM/FTA/FT%, Rebounds, Assists, Steals, Blocks, Turnovers, PlusMinus |

**Indexes:** `teamId`, `season`, `[teamId, season]`, `lineupKey`, `netRating`, `totalMinutes`

---

### Standing
Primary key: `id` (cuid)
Unique: `[teamId, season, asOfDate]`

| Field | Type | Notes |
|-------|------|-------|
| teamId, seasonId | String | FK references |
| season | String | "2025-26" |
| asOfDate | DateTime | Snapshot date |
| wins, losses, winPct, gamesBehind | Int/Float | Record |
| streak | String? | e.g. "W5" |
| lastTenWins, lastTenLosses | Int? | Recent form |
| conferenceRank, divisionRank, leagueRank, playoffSeed | Int? | Rankings |
| home/away/conf/div splits | Int? | Record splits |
| clinchStatus | String? | Playoff clinch |
| pointsFor, pointsAgainst, pointDiff | Float? | Scoring margins |

**Indexes:** `teamId`, `season`, `asOfDate`, `conferenceRank`, `[teamId, season]`

---

## Key Relationships

```
Team 1──* Player
Team 1──* GameBoxScore (home + away)
Team 1──* PlayerGameLog
Team 1──* PlayerSeasonStats
Team 1──* TeamSeasonStats
Team 1──* TeamGameEfficiency
Team 1──* TeamEfficiencySnapshot
Team 1──* ShotChart
Team 1──* LineupStats
Team 1──* Standing

Player 1──* PlayerGameLog
Player 1──* PlayerSeasonStats
Player 1──* ShotChart

Season 1──* GameBoxScore
Season 1──* PlayerGameLog
Season 1──* PlayerSeasonStats
Season 1──* TeamSeasonStats
Season 1──* TeamGameEfficiency
Season 1──* TeamEfficiencySnapshot
Season 1──* ShotChart
Season 1──* LineupStats
Season 1──* Standing

GameBoxScore 1──* PlayerGameLog   (via gameId)
GameBoxScore 1──* TeamGameEfficiency (via gameId)
GameBoxScore 1──* ShotChart          (via gameId)
```

## Index Strategy

1. **Primary lookups:** Every FK field is indexed (`teamId`, `playerId`, `gameId`, `seasonId`)
2. **Date-based queries:** `gameDate` and `asOfDate` are indexed for time-range filters
3. **Compound indexes:** `[playerId, season]`, `[teamId, season]`, `[teamId, season, window]` for common dashboard queries
4. **Ranking/sort indexes:** `conferenceRank` on Standing, `netRating` and `totalMinutes` on LineupStats
5. **Filter indexes:** `shotZone`, `shotResult`, `isPlayoff`, `isActive`, `isCurrent`

## Notes for Other Workers

- **ETL (Worker 3):** All NBA IDs are strings. Use the NBA's own IDs for `Team.id`, `Player.id`, and `GameBoxScore.gameId`. Season ID is the "YYYY-YY" string. All percentages stored 0.0-1.0 (divide by 100 if NBA API returns percentages as e.g. 45.3).
- **API (Worker 2):** Prisma client is generated to `src/generated/prisma`. Import as `import { PrismaClient } from '@/generated/prisma'`. All models have `createdAt`/`updatedAt` auto-managed.
- **Frontend (Workers 4-5):** Standing snapshots are keyed by `asOfDate` — use the latest date for current standings. TeamEfficiencySnapshot `window` values: `"L5"`, `"L10"`, `"L20"`, `"Season"`.
- **LineupStats:** The `lineupKey` is 5 player IDs sorted ascending and joined with dashes. Always sort before lookup.
