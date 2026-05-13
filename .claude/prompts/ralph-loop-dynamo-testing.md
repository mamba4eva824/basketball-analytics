# Ralph Loop: NBA Analytics Full-Stack Testing

## Context Summary

Testing the NBA basketball analytics platform's full data pipeline and dashboard, focusing on:
1. **ETL Pipeline**: Python fetch modules pulling data from nba_api into PostgreSQL
2. **API Routes**: Next.js API endpoints serving player stats, team data, standings
3. **Dashboard Components**: React components rendering charts, tables, and visualizations
4. **Data Integrity**: End-to-end validation from nba_api → PostgreSQL → API → UI

## Architecture Reference

```
nba_api (stats.nba.com)
    ↓ Python ETL (fetch_*.py)
PostgreSQL (Prisma models)
    ↓ Next.js API Routes
React Dashboard (Recharts + TanStack Query)
```

### Data Flow

```
ETL Layer                         Database Layer                    API/UI Layer
┌──────────────────┐             ┌──────────────────────┐         ┌─────────────────────┐
│ fetch_players.py │──────┐      │ Player               │         │ /api/players/[id]   │
│ fetch_teams.py   │──┐   │      │ Team                 │         │ /api/teams/[id]     │
│ fetch_game_logs  │  │   ├─────▶│ PlayerGameLog        │────────▶│ /api/standings      │
│ fetch_standings  │  │   │      │ PlayerSeasonStats    │         │ /api/players/[id]/  │
│ fetch_shots.py   │  │   │      │ TeamSeasonStats      │         │   shots             │
│ fetch_advanced   │  │   │      │ ShotChart            │         │ /api/league-leaders │
│ fetch_efficiency │──┘   │      │ Standing             │         └─────────────────────┘
└──────────────────┘      │      │ TeamEfficiency...    │
                          │      └──────────────────────┘
                          │
                    run_all.py / run_incremental.py
```

## Tasks

### Phase 1: ETL Unit Tests

Validate Python ETL modules in `nba-analytics/etl/tests/`:

1. **Test fetch_players.py**
   - Mock nba_api CommonAllPlayers response
   - Verify DataFrame transformation and column mapping
   - Verify upsert handles existing players without duplicates

2. **Test fetch_game_logs.py**
   - Mock nba_api PlayerGameLog response
   - Verify stat calculations (PTS, REB, AST, etc.)
   - Verify date parsing and game ID mapping

3. **Test fetch_shots.py**
   - Mock nba_api ShotChartDetail response
   - Verify coordinate mapping (x, y positions)
   - Verify shot result classification (made/missed)

4. **Test fetch_standings.py**
   - Mock nba_api LeagueStandings response
   - Verify conference/division grouping
   - Verify win percentage calculation

### Phase 2: API Route Unit Tests

Create/update Vitest tests in `nba-analytics/src/__tests__/api/`:

1. **Test GET /api/players/[playerId]**
   - Mock Prisma client findUnique
   - Verify response includes player info + season stats
   - Verify 404 for non-existent player

2. **Test GET /api/players/[playerId]/shots**
   - Mock Prisma client findMany for ShotChart
   - Verify coordinate data in response
   - Verify filtering by season/game

3. **Test GET /api/standings**
   - Mock Prisma client for Standing model
   - Verify conference grouping in response
   - Verify sort order (win percentage)

4. **Test GET /api/league-leaders**
   - Mock Prisma client aggregate queries
   - Verify stat category leaders are correct
   - Verify minimum games threshold

### Phase 3: E2E Tests

Run Playwright tests in `nba-analytics/e2e/`:

1. **Test navigation flow**
   - Home → Player → Shot Chart → Back
   - Home → Standings → Team → Roster

2. **Test player dashboard**
   - Verify stat cards render with data
   - Verify trend charts load without errors
   - Verify empty state handling

3. **Test standings page**
   - Verify conference tabs work
   - Verify team links navigate correctly

### Phase 4: Data Integrity Tests

1. **Test ETL → DB consistency**
   - Run ETL for a known player (e.g., LeBron James)
   - Query DB directly and verify row counts match expectations
   - Verify no orphaned records

2. **Test DB → API consistency**
   - Fetch player via API route
   - Compare response with direct Prisma query
   - Verify no data transformation errors

### Phase 5: Edge Cases

1. **Missing data handling**
   - Player with no game logs for current season
   - Team with incomplete roster data
   - Shot chart with null coordinates

2. **ETL resilience**
   - nba_api returns empty response
   - nba_api rate limit hit (429)
   - Database connection timeout during upsert

3. **UI edge cases**
   - Charts with single data point
   - Tables with zero rows
   - Very long player names in layout

## Run Commands

```bash
# ETL tests
cd nba-analytics && source etl-env/bin/activate && pytest etl/tests/ -v

# Unit tests (API routes + lib)
cd nba-analytics && npx vitest run

# E2E tests
cd nba-analytics && npx playwright test

# All tests in sequence
cd nba-analytics && source etl-env/bin/activate && pytest etl/tests/ -v && deactivate && npx vitest run && npx playwright test
```

## Success Criteria

1. All ETL tests pass with mocked nba_api responses
2. All API route tests pass with mocked Prisma client
3. E2E tests pass against running dev server with seeded data
4. No data integrity issues between ETL → DB → API layers

---

*Prompt Version: 1.0*
*Created: March 2026*
*Purpose: Ralph Loop testing for NBA Analytics platform*
