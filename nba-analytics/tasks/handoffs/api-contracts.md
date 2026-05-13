# API Contracts — Worker 3 Handoff

> Generated: 2026-03-21
> All routes: `src/app/api/`
> Shared utilities: `src/app/api/_lib/`

---

## Response Shape Standard

Every API response follows one of two shapes:

```typescript
// Success
{
  "success": true,
  "data": T,
  "meta"?: {
    "total": number,
    "page": number,
    "pageSize": number
  }
}

// Error
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST" | "NOT_FOUND" | "INTERNAL_ERROR",
    "message": string
  }
}
```

### TypeScript Types

```typescript
interface ApiMeta {
  total: number
  page: number
  pageSize: number
}

interface ApiSuccessResponse<T> {
  success: true
  data: T
  meta?: ApiMeta
}

interface ApiErrorResponse {
  success: false
  error: {
    code: string
    message: string
  }
}

type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse
```

### Common Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number (1-indexed) |
| `pageSize` | number | 25 | Items per page (max 100) |
| `season` | string | — | Season in "YYYY-YY" format, e.g. "2025-26" |

---

## Teams Endpoints

### GET /api/teams

List all teams, optionally filtered.

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `conference` | string | No | — | "EAST" or "WEST" (case-insensitive) |
| `division` | string | No | — | "ATLANTIC", "CENTRAL", "SOUTHEAST", "NORTHWEST", "PACIFIC", "SOUTHWEST" |
| `search` | string | No | — | Search by name, abbreviation, city, or nickname |

**Example Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "1610612747",
      "abbreviation": "LAL",
      "name": "Los Angeles Lakers",
      "city": "Los Angeles",
      "nickname": "Lakers",
      "conference": "WEST",
      "division": "PACIFIC",
      "logoUrl": "https://...",
      "primaryColor": "#552583",
      "secondaryColor": "#FDB927"
    }
  ],
  "meta": { "total": 30, "page": 1, "pageSize": 30 }
}
```

---

### GET /api/teams/:teamId

Get a single team with latest season stats and current standing.

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `teamId` | string | NBA team ID (e.g. "1610612747") |

**Example Response:**

```json
{
  "success": true,
  "data": {
    "id": "1610612747",
    "abbreviation": "LAL",
    "name": "Los Angeles Lakers",
    "city": "Los Angeles",
    "nickname": "Lakers",
    "conference": "WEST",
    "division": "PACIFIC",
    "logoUrl": "...",
    "primaryColor": "#552583",
    "secondaryColor": "#FDB927",
    "teamSeasonStats": [
      {
        "season": "2025-26",
        "wins": 42,
        "losses": 20,
        "offRating": 115.2,
        "defRating": 110.1,
        "netRating": 5.1
      }
    ],
    "standings": [
      {
        "wins": 42,
        "losses": 20,
        "winPct": 0.677,
        "conferenceRank": 3,
        "divisionRank": 1,
        "streak": "W5",
        "playoffSeed": 3,
        "clinchStatus": "x"
      }
    ]
  }
}
```

---

### GET /api/teams/:teamId/roster

Get team roster. With `season`, returns players who played for the team that season with their season stats. Without `season`, returns the current roster.

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `teamId` | string | NBA team ID |

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `season` | string | No | — | Season in "YYYY-YY" format |

**Example Response (with season):**

```json
{
  "success": true,
  "data": [
    {
      "id": "2544",
      "firstName": "LeBron",
      "lastName": "James",
      "fullName": "LeBron James",
      "position": "F",
      "jersey": "23",
      "height": "6-9",
      "weight": 250,
      "isActive": true,
      "headshotUrl": "...",
      "country": "USA",
      "seasonStats": {
        "gamesPlayed": 55,
        "gamesStarted": 55,
        "minutesPerGame": 35.2,
        "pointsPerGame": 25.1,
        "reboundsPerGame": 7.8,
        "assistsPerGame": 8.2
      }
    }
  ],
  "meta": { "total": 15, "page": 1, "pageSize": 15 }
}
```

---

### GET /api/teams/:teamId/stats

Get team season stats including advanced metrics.

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `teamId` | string | NBA team ID |

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `season` | string | **Yes** | — | Season in "YYYY-YY" format |

**Example Response:**

```json
{
  "success": true,
  "data": {
    "team": { "id": "1610612747", "abbreviation": "LAL", "name": "Los Angeles Lakers" },
    "season": "2025-26",
    "record": {
      "wins": 42,
      "losses": 20,
      "winPct": 0.677,
      "gamesPlayed": 62
    },
    "perGame": {
      "pointsPerGame": 115.3,
      "oppPointsPerGame": 110.1,
      "fieldGoalPct": 0.478,
      "threePointPct": 0.368,
      "freeThrowPct": 0.791,
      "reboundsPerGame": 45.2,
      "assistsPerGame": 27.1,
      "stealsPerGame": 8.2,
      "blocksPerGame": 5.1,
      "turnoversPerGame": 13.5
    },
    "advanced": {
      "offRtg": 115.2,
      "defRtg": 110.1,
      "netRtg": 5.1,
      "pace": 100.5,
      "efgPct": 0.542,
      "tsPct": 0.581,
      "tovPct": 0.128,
      "orbPct": 0.271,
      "ftRate": 0.265,
      "oppEfgPct": 0.521,
      "oppTovPct": 0.135,
      "oppFtRate": 0.241
    },
    "scoringBreakdown": {
      "fastBreakPtsPerGame": 14.5,
      "ptsInPaintPerGame": 52.3,
      "ptsOffTurnoversPerGame": 18.1,
      "secondChancePtsPerGame": 12.8
    }
  }
}
```

---

### GET /api/teams/:teamId/games

Get game results for a team in a season.

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `teamId` | string | NBA team ID |

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `season` | string | **Yes** | — | Season in "YYYY-YY" format |
| `startDate` | string | No | — | "YYYY-MM-DD" start filter |
| `endDate` | string | No | — | "YYYY-MM-DD" end filter |
| `result` | string | No | — | "W" or "L" |
| `isPlayoff` | string | No | — | "true" or "false" |
| `page` | number | No | 1 | Page number |
| `pageSize` | number | No | 25 | Items per page |

**Example Response:**

```json
{
  "success": true,
  "data": [
    {
      "gameId": "0022500123",
      "gameDate": "2025-11-15T00:00:00.000Z",
      "isPlayoff": false,
      "homeAway": "HOME",
      "result": "W",
      "opponent": { "id": "1610612738", "abbreviation": "BOS", "name": "Boston Celtics", "logoUrl": "..." },
      "teamPoints": 118,
      "oppPoints": 112,
      "arena": "Crypto.com Arena",
      "attendance": 18997,
      "teamStats": {
        "fieldGoals": 44,
        "fieldGoalAtt": 90,
        "fieldGoalPct": 0.489,
        "threePointers": 14,
        "threePointAtt": 38,
        "threePointPct": 0.368,
        "freeThrows": 16,
        "freeThrowAtt": 20,
        "freeThrowPct": 0.800,
        "reboundsTotal": 48,
        "assists": 29,
        "steals": 9,
        "blocks": 6,
        "turnovers": 12
      }
    }
  ],
  "meta": { "total": 62, "page": 1, "pageSize": 25 }
}
```

---

### GET /api/teams/:teamId/efficiency

Get team efficiency data — per-game ratings and/or windowed snapshots.

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `teamId` | string | NBA team ID |

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `season` | string | **Yes** | — | Season in "YYYY-YY" format |
| `type` | string | No | "both" | "game", "snapshot", or "both" |

**Example Response (type=both):**

```json
{
  "success": true,
  "data": {
    "team": { "id": "1610612747", "abbreviation": "LAL", "name": "Los Angeles Lakers" },
    "season": "2025-26",
    "gameEfficiency": [
      {
        "gameId": "0022500001",
        "gameDate": "2025-10-22T00:00:00.000Z",
        "offRating": 112.5,
        "defRating": 108.3,
        "netRating": 4.2,
        "pace": 99.8,
        "possessions": 98.5,
        "result": "W",
        "homeAway": "HOME"
      }
    ],
    "snapshots": [
      {
        "window": "L10",
        "snapshotDate": "2026-03-20T00:00:00.000Z",
        "offRating": 116.1,
        "defRating": 109.5,
        "netRating": 6.6,
        "pace": 101.2,
        "wins": 7,
        "losses": 3,
        "winPct": 0.700,
        "effectiveFgPct": 0.551,
        "turnoverPct": 0.121,
        "offReboundPct": 0.285,
        "freeThrowRate": 0.272,
        "oppEffectiveFgPct": 0.508,
        "oppTurnoverPct": 0.142,
        "oppOffReboundPct": 0.235,
        "oppFreeThrowRate": 0.228
      }
    ]
  }
}
```

---

### GET /api/teams/:teamId/lineups

Get lineup combination stats for a team.

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `teamId` | string | NBA team ID |

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `season` | string | **Yes** | — | Season in "YYYY-YY" format |
| `sortBy` | string | No | "totalMinutes" | "netRating", "totalMinutes", "offRating", "defRating", "plusMinus" |
| `sortDir` | string | No | "desc" | "asc" or "desc" |
| `minMinutes` | number | No | 0 | Minimum total minutes filter |
| `page` | number | No | 1 | Page number |
| `pageSize` | number | No | 25 | Items per page |

**Example Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "clx...",
      "lineupKey": "101-202-303-404-505",
      "players": [
        { "id": "101", "fullName": "Player A", "position": "G", "headshotUrl": "..." },
        { "id": "202", "fullName": "Player B", "position": "G", "headshotUrl": "..." },
        { "id": "303", "fullName": "Player C", "position": "F", "headshotUrl": "..." },
        { "id": "404", "fullName": "Player D", "position": "F", "headshotUrl": "..." },
        { "id": "505", "fullName": "Player E", "position": "C", "headshotUrl": "..." }
      ],
      "gamesPlayed": 35,
      "totalMinutes": 280.5,
      "offRating": 118.2,
      "defRating": 106.5,
      "netRating": 11.7,
      "pace": 101.3,
      "points": 450,
      "oppPoints": 380,
      "fieldGoalPct": 0.502,
      "threePointPct": 0.395,
      "freeThrowPct": 0.812,
      "rebounds": 320,
      "assists": 180,
      "steals": 55,
      "blocks": 30,
      "turnovers": 85,
      "plusMinus": 95.0
    }
  ],
  "meta": { "total": 150, "page": 1, "pageSize": 25 }
}
```

---

## Players Endpoints

### GET /api/players

List players with optional filters.

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `teamId` | string | No | — | Filter by current team ID |
| `search` | string | No | — | Search by name (first, last, or full) |
| `position` | string | No | — | Filter by position (partial match, e.g. "G", "F") |
| `isActive` | string | No | — | "true" or "false" |
| `page` | number | No | 1 | Page number |
| `pageSize` | number | No | 25 | Items per page |

**Example Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "2544",
      "firstName": "LeBron",
      "lastName": "James",
      "fullName": "LeBron James",
      "position": "F",
      "jersey": "23",
      "height": "6-9",
      "weight": 250,
      "isActive": true,
      "headshotUrl": "...",
      "teamId": "1610612747",
      "team": {
        "id": "1610612747",
        "abbreviation": "LAL",
        "name": "Los Angeles Lakers",
        "logoUrl": "..."
      }
    }
  ],
  "meta": { "total": 500, "page": 1, "pageSize": 25 }
}
```

---

### GET /api/players/:playerId

Get a single player with career season stats.

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `playerId` | string | NBA player ID (e.g. "2544") |

**Example Response:**

```json
{
  "success": true,
  "data": {
    "id": "2544",
    "firstName": "LeBron",
    "lastName": "James",
    "fullName": "LeBron James",
    "birthDate": "1984-12-30T00:00:00.000Z",
    "height": "6-9",
    "weight": 250,
    "position": "F",
    "jersey": "23",
    "isActive": true,
    "fromYear": 2003,
    "toYear": 2025,
    "draftYear": 2003,
    "draftRound": 1,
    "draftPick": 1,
    "country": "USA",
    "school": "St. Vincent-St. Mary HS",
    "headshotUrl": "...",
    "teamId": "1610612747",
    "team": {
      "id": "1610612747",
      "abbreviation": "LAL",
      "name": "Los Angeles Lakers",
      "logoUrl": "...",
      "primaryColor": "#552583"
    },
    "playerSeasonStats": [
      {
        "season": "2025-26",
        "teamId": "1610612747",
        "gamesPlayed": 55,
        "gamesStarted": 55,
        "minutesPerGame": 35.2,
        "pointsPerGame": 25.1,
        "reboundsPerGame": 7.8,
        "assistsPerGame": 8.2,
        "stealsPerGame": 1.2,
        "blocksPerGame": 0.6,
        "turnoversPerGame": 3.5,
        "fieldGoalPct": 0.521,
        "threePointPct": 0.378,
        "freeThrowPct": 0.742,
        "trueShootingPct": 0.612,
        "effectiveFgPct": 0.575,
        "usageRate": 0.298,
        "per": 24.5,
        "winShares": 8.2,
        "boxPlusMinus": 6.1,
        "vorp": 4.3
      }
    ]
  }
}
```

---

### GET /api/players/:playerId/gamelog

Get per-game stats for a player.

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `playerId` | string | NBA player ID |

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `season` | string | No | — | Season filter |
| `last` | number | No | — | Last N games (1-82); overrides pagination |
| `startDate` | string | No | — | "YYYY-MM-DD" start filter |
| `endDate` | string | No | — | "YYYY-MM-DD" end filter |
| `page` | number | No | 1 | Page number (ignored when `last` is set) |
| `pageSize` | number | No | 25 | Items per page (ignored when `last` is set) |

**Example Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "clx...",
      "playerId": "2544",
      "teamId": "1610612747",
      "gameId": "0022500123",
      "season": "2025-26",
      "seasonId": "2025-26",
      "gameDate": "2025-11-15T00:00:00.000Z",
      "homeAway": "HOME",
      "result": "W",
      "minutes": 36.5,
      "minutesStr": "36:30",
      "points": 32,
      "fieldGoals": 12,
      "fieldGoalAtt": 22,
      "fieldGoalPct": 0.545,
      "threePointers": 4,
      "threePointAtt": 9,
      "threePointPct": 0.444,
      "freeThrows": 4,
      "freeThrowAtt": 5,
      "freeThrowPct": 0.800,
      "reboundsOff": 1,
      "reboundsDef": 7,
      "reboundsTotal": 8,
      "assists": 10,
      "steals": 2,
      "blocks": 1,
      "turnovers": 3,
      "personalFouls": 2,
      "plusMinus": 12.0,
      "offRating": 118.5,
      "defRating": 105.2,
      "netRating": 13.3,
      "started": true,
      "dnp": false,
      "dnpReason": null,
      "team": { "id": "1610612747", "abbreviation": "LAL" }
    }
  ],
  "meta": { "total": 55, "page": 1, "pageSize": 25 }
}
```

---

### GET /api/players/:playerId/stats

Get player season stats. If `season` is provided, returns a single object; otherwise returns an array of all seasons.

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `playerId` | string | NBA player ID |

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `season` | string | No | — | Season filter; without it, returns all seasons |

**Example Response (single season):**

```json
{
  "success": true,
  "data": {
    "id": "clx...",
    "playerId": "2544",
    "teamId": "1610612747",
    "season": "2025-26",
    "gamesPlayed": 55,
    "gamesStarted": 55,
    "minutesPerGame": 35.2,
    "pointsPerGame": 25.1,
    "reboundsPerGame": 7.8,
    "assistsPerGame": 8.2,
    "stealsPerGame": 1.2,
    "blocksPerGame": 0.6,
    "turnoversPerGame": 3.5,
    "fieldGoalPct": 0.521,
    "threePointPct": 0.378,
    "freeThrowPct": 0.742,
    "trueShootingPct": 0.612,
    "effectiveFgPct": 0.575,
    "usageRate": 0.298,
    "per": 24.5,
    "winShares": 8.2,
    "boxPlusMinus": 6.1,
    "vorp": 4.3,
    "totalPoints": 1380,
    "totalRebounds": 429,
    "totalAssists": 451,
    "team": {
      "id": "1610612747",
      "abbreviation": "LAL",
      "name": "Los Angeles Lakers",
      "logoUrl": "..."
    }
  }
}
```

---

### GET /api/players/:playerId/shots

Get shot chart data for a player in a season.

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `playerId` | string | NBA player ID |

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `season` | string | **Yes** | — | Season in "YYYY-YY" format |
| `gameId` | string | No | — | Filter to a specific game |
| `shotZone` | string | No | — | Filter by shot zone (e.g. "Restricted Area") |
| `shotType` | string | No | — | "TWO_POINTER" or "THREE_POINTER" |
| `shotResult` | string | No | — | "MADE" or "MISSED" |
| `period` | number | No | — | Filter by quarter (1-4, 5+ for OT) |

**Example Response:**

```json
{
  "success": true,
  "data": {
    "player": { "id": "2544", "fullName": "LeBron James" },
    "season": "2025-26",
    "totalShots": 1200,
    "totalMade": 625,
    "overallPct": 0.521,
    "zoneSummary": [
      { "zone": "Restricted Area", "made": 180, "attempted": 250, "pct": 0.720 },
      { "zone": "Mid-Range", "made": 85, "attempted": 210, "pct": 0.405 },
      { "zone": "Above the Break 3", "made": 120, "attempted": 320, "pct": 0.375 }
    ],
    "shots": [
      {
        "id": "clx...",
        "gameId": "0022500123",
        "locX": 15.5,
        "locY": 22.3,
        "shotZone": "Restricted Area",
        "shotZoneArea": "Center(C)",
        "shotZoneRange": "Less Than 8 ft.",
        "shotDistance": 3,
        "shotType": "TWO_POINTER",
        "shotResult": "MADE",
        "actionType": "Driving Layup",
        "period": 1,
        "gameClock": "9:45",
        "shotValue": 2
      }
    ]
  }
}
```

---

### GET /api/players/:playerId/trends

Get rolling averages for a stat over a game window.

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `playerId` | string | NBA player ID |

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `metric` | string | **Yes** | — | Stat to track (see valid values below) |
| `window` | number | No | 10 | Rolling window size (2-82) |
| `season` | string | No | — | Season filter |

**Valid `metric` values:**

`pts`, `points`, `fg_pct`, `three_pct`, `ft_pct`, `rebounds`, `reb`, `assists`, `ast`, `steals`, `stl`, `blocks`, `blk`, `turnovers`, `tov`, `plus_minus`, `minutes`, `ts_pct`, `efg_pct`, `usg`, `off_rtg`, `def_rtg`, `net_rtg`

**Example Response:**

```json
{
  "success": true,
  "data": {
    "player": { "id": "2544", "fullName": "LeBron James" },
    "metric": "pts",
    "field": "points",
    "window": 10,
    "season": "2025-26",
    "dataPoints": 55,
    "trend": [
      {
        "gameDate": "2025-10-22T00:00:00.000Z",
        "gameId": "0022500001",
        "value": 28,
        "rollingAvg": 28.0
      },
      {
        "gameDate": "2025-10-24T00:00:00.000Z",
        "gameId": "0022500015",
        "value": 22,
        "rollingAvg": 25.0
      }
    ]
  }
}
```

---

## Standings Endpoint

### GET /api/standings

Get league standings grouped by conference.

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `season` | string | No | Current season | Season in "YYYY-YY" format |
| `conference` | string | No | — | "EAST" or "WEST" (case-insensitive) |
| `asOfDate` | string | No | Latest available | "YYYY-MM-DD" specific snapshot date |

**Example Response:**

```json
{
  "success": true,
  "data": {
    "season": "2025-26",
    "asOfDate": "2026-03-20T00:00:00.000Z",
    "east": [
      {
        "team": {
          "id": "1610612738",
          "abbreviation": "BOS",
          "name": "Boston Celtics",
          "city": "Boston",
          "nickname": "Celtics",
          "conference": "EAST",
          "division": "ATLANTIC",
          "logoUrl": "...",
          "primaryColor": "#007A33",
          "secondaryColor": "#BA9653"
        },
        "wins": 50,
        "losses": 14,
        "winPct": 0.781,
        "gamesBehind": 0,
        "streak": "W8",
        "lastTen": "9-1",
        "conferenceRank": 1,
        "divisionRank": 1,
        "leagueRank": 1,
        "playoffSeed": 1,
        "home": "28-5",
        "away": "22-9",
        "conf": "35-9",
        "div": "12-2",
        "clinchStatus": "z",
        "pointsFor": 118.5,
        "pointsAgainst": 108.2,
        "pointDiff": 10.3
      }
    ],
    "west": [
      { "..." : "same shape" }
    ]
  }
}
```

---

## League Endpoint

### GET /api/league/leaders

Get stat leaders for a season.

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `stat` | string | **Yes** | — | Stat category (see valid values below) |
| `season` | string | No | Current season | Season filter |
| `minGames` | number | No | 10 | Minimum games played to qualify |
| `page` | number | No | 1 | Page number |
| `pageSize` | number | No | 25 | Items per page |

**Valid `stat` values:**

`pts`, `points`, `reb`, `rebounds`, `ast`, `assists`, `stl`, `steals`, `blk`, `blocks`, `fg_pct`, `three_pct`, `ft_pct`, `ts_pct`, `efg_pct`, `per`, `ws`, `bpm`, `vorp`, `usg`, `mpg`, `off_rtg`, `def_rtg`, `net_rtg`

**Example Response:**

```json
{
  "success": true,
  "data": [
    {
      "rank": 1,
      "player": { "id": "2544", "fullName": "LeBron James", "position": "F", "headshotUrl": "..." },
      "team": { "id": "1610612747", "abbreviation": "LAL", "name": "Los Angeles Lakers", "logoUrl": "..." },
      "season": "2025-26",
      "gamesPlayed": 55,
      "statValue": 28.5,
      "statName": "pts",
      "statField": "pointsPerGame",
      "pointsPerGame": 28.5,
      "reboundsPerGame": 7.8,
      "assistsPerGame": 8.2,
      "minutesPerGame": 35.2
    }
  ],
  "meta": { "total": 200, "page": 1, "pageSize": 25 }
}
```

---

## Route File Map

| Route | File |
|-------|------|
| GET /api/teams | `src/app/api/teams/route.ts` |
| GET /api/teams/:teamId | `src/app/api/teams/[teamId]/route.ts` |
| GET /api/teams/:teamId/roster | `src/app/api/teams/[teamId]/roster/route.ts` |
| GET /api/teams/:teamId/stats | `src/app/api/teams/[teamId]/stats/route.ts` |
| GET /api/teams/:teamId/games | `src/app/api/teams/[teamId]/games/route.ts` |
| GET /api/teams/:teamId/efficiency | `src/app/api/teams/[teamId]/efficiency/route.ts` |
| GET /api/teams/:teamId/lineups | `src/app/api/teams/[teamId]/lineups/route.ts` |
| GET /api/players | `src/app/api/players/route.ts` |
| GET /api/players/:playerId | `src/app/api/players/[playerId]/route.ts` |
| GET /api/players/:playerId/gamelog | `src/app/api/players/[playerId]/gamelog/route.ts` |
| GET /api/players/:playerId/stats | `src/app/api/players/[playerId]/stats/route.ts` |
| GET /api/players/:playerId/shots | `src/app/api/players/[playerId]/shots/route.ts` |
| GET /api/players/:playerId/trends | `src/app/api/players/[playerId]/trends/route.ts` |
| GET /api/standings | `src/app/api/standings/route.ts` |
| GET /api/league/leaders | `src/app/api/league/leaders/route.ts` |

## Shared Utilities

| File | Purpose |
|------|---------|
| `src/app/api/_lib/prisma.ts` | Prisma Client singleton (hot-reload safe) |
| `src/app/api/_lib/response.ts` | `successResponse()`, `errorResponse()`, `notFound()`, `badRequest()`, `serverError()` |
| `src/app/api/_lib/validation.ts` | Shared Zod schemas: `seasonSchema`, `paginationSchema`, `conferenceSchema`, `dateSchema`, `sortDirectionSchema`, `parseSearchParams()` |

## Notes for Frontend (Worker 4)

1. **Import the Prisma singleton** is only for API routes; frontend components should `fetch()` these endpoints.
2. **Season format** is always `"YYYY-YY"` (e.g. `"2025-26"`).
3. **Pagination** defaults to page 1, pageSize 25. The `meta` object always tells you `total`, `page`, and `pageSize`.
4. **Standings** are auto-grouped into `east` and `west` arrays.
5. **Trends endpoint** returns a `trend` array with `gameDate`, `value`, and `rollingAvg` — ideal for charting with Recharts.
6. **Shot chart** returns both individual `shots` and aggregated `zoneSummary` — use `locX`/`locY` for scatter plots and `zoneSummary` for zone heatmaps.
7. **Efficiency endpoint** with `type=both` returns both per-game time series (`gameEfficiency`) and windowed snapshots (`snapshots`).
8. **Team games** are enriched with the queried team's perspective (home/away normalized) so the frontend doesn't need to do that logic.
9. **All percentages** are stored as 0.0-1.0 (multiply by 100 for display).
