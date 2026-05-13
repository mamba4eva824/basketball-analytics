# Agent Prompt: Run API Unit Tests

You are a testing agent responsible for running and fixing the **API unit test suite** (Vitest) for the NBA Analytics Dashboard.

## Context

The API layer (`src/app/api/`) serves data from PostgreSQL via Prisma to the React frontend. These tests validate that every API route:
- Returns the correct response shape (`{ success, data, meta }` or `{ success, error }`)
- Applies filter query params correctly (season, playerId, gameId, period, etc.)
- Returns proper error responses for invalid input
- Reads correct data from the seeded test database

## Step 1: Setup

```bash
cd /Users/christopherweinreich/Documents/Projects/basketball_analytics/nba-analytics
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nba_analytics_test"

# Reset test database
npx prisma db push --force-reset
npx tsx scripts/seed-test-data.ts
```

## Step 2: Run the Tests

```bash
npx vitest run --reporter=verbose 2>&1 | tee ../documentation/logs/unit-test-results.log
```

## Step 3: If Tests Fail

1. Read the failure output. Identify the failing test and the assertion that broke.
2. Determine if the fix belongs in:
   - `src/app/api/**/route.ts` (API route bug — wrong query, missing filter, bad response shape)
   - `src/app/api/_lib/*.ts` (shared utility bug — response helper, validation schema)
   - `src/__tests__/**/*.test.ts` (test itself is wrong — wrong expected value, bad setup)
   - `prisma/schema.prisma` (schema mismatch — flag as BLOCKER for Worker 1)
3. Fix the code. Re-run the failing test file in isolation:
   ```bash
   npx vitest run src/__tests__/api/team-shots.test.ts
   ```
4. Once the individual test passes, re-run the full suite.
5. Repeat until all tests pass.

## Step 4: Log Results

After all tests pass (or after exhausting fixes), write the results to:

```
documentation/logs/unit-test-results.log
```

The log MUST include:
- Timestamp of the test run
- Full Vitest output (pass/fail for each test)
- For any test that required fixes:
  - What failed and the error message
  - What file was changed and what the fix was
  - Why the fix was necessary
- Final status: ALL PASSED or list of remaining failures

## Test Files

```
src/__tests__/
├── setup.ts                     # Prisma test client, DB reset helper
├── api/
│   ├── teams.test.ts            # GET /api/teams, GET /api/teams/:teamId
│   ├── team-stats.test.ts       # GET /api/teams/:teamId/stats — Four Factors, efficiency
│   ├── team-shots.test.ts       # GET /api/teams/:teamId/shots — player/game/period filters
│   ├── players.test.ts          # GET /api/players — search, team filtering
│   ├── player-gamelog.test.ts   # GET /api/players/:playerId/gamelog — last N, date range
│   ├── player-shots.test.ts     # GET /api/players/:playerId/shots — game/period/type filters
│   ├── player-trends.test.ts    # GET /api/players/:playerId/trends — rolling avg window
│   ├── standings.test.ts        # GET /api/standings — conference filter
│   └── league-leaders.test.ts   # GET /api/league/leaders — stat sorting
└── lib/
    ├── response.test.ts         # success/error response shape helpers
    └── validation.test.ts       # Zod schema edge cases
```

## Key Assertions to Verify

For every API route, tests MUST check:
1. `res.status` is 200 for valid requests
2. `json.success` is `true`
3. `json.data` is an array (for list endpoints) or object (for single-resource endpoints)
4. `json.meta` has `total`, `page`, `pageSize` for list endpoints
5. Filter params actually reduce the result set (e.g., filtering by `playerId` means all returned shots have that `playerId`)
6. Invalid params return `{ success: false, error: { code, message } }` with appropriate status code

For shot endpoints specifically:
- `json.meta.players` array exists and has `{ playerId, playerName }` shape
- `json.meta.games` array exists and has `{ gameId, gameDate, matchup }` shape

## Rules

- Do NOT modify ETL scripts, frontend components, or Playwright tests.
- You MAY modify `src/app/api/**/*.ts`, `src/__tests__/**/*.ts`, `src/app/api/_lib/*.ts`, and `vitest.config.ts`.
- Do NOT modify the Prisma schema. If it's wrong, log it as a blocker.
- Always re-run the full suite after any fix to check for regressions.
