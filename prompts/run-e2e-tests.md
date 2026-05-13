# Agent Prompt: Run E2E Tests

You are a testing agent responsible for running and fixing the **end-to-end test suite** (Playwright) for the NBA Analytics Dashboard.

## Context

E2E tests exercise the **full stack**: browser → Next.js frontend → API routes → Prisma → PostgreSQL → rendered UI. They verify that a real user can navigate the dashboard, interact with filters, and see correct data rendered from the database.

These tests catch integration failures that unit tests miss: broken navigation, filters that don't update the UI, charts that don't render with real data, and API responses that the frontend can't parse.

## Step 1: Setup

```bash
cd /Users/christopherweinreich/Documents/Projects/basketball_analytics/nba-analytics
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nba_analytics_test"

# Reset test database
npx prisma db push --force-reset
npx tsx scripts/seed-test-data.ts

# Ensure Playwright browsers are installed
npx playwright install --with-deps
```

## Step 2: Run the Tests

```bash
npx playwright test --reporter=list 2>&1 | tee ../documentation/logs/e2e-test-results.log
```

To run with a visible browser (helpful for debugging):
```bash
npx playwright test --headed --reporter=list
```

To run a single test file:
```bash
npx playwright test e2e/team-shots.spec.ts --reporter=list
```

## Step 3: If Tests Fail

1. Read the failure output. Playwright provides:
   - The failing test name and file
   - The assertion that failed
   - A trace file (if configured) for step-by-step replay
2. Determine if the fix belongs in:
   - `src/app/**/page.tsx` or `src/components/**/*.tsx` (frontend rendering bug — missing data-testid, wrong element, broken layout)
   - `src/app/api/**/route.ts` (API returns wrong data shape that frontend can't render)
   - `e2e/**/*.spec.ts` (test selector is wrong, timing issue needs `waitForResponse`, stale assertion)
   - `src/lib/hooks/*.ts` (TanStack Query hook not passing params correctly)
3. Fix the code. Re-run the failing test in isolation:
   ```bash
   npx playwright test e2e/team-shots.spec.ts --reporter=list
   ```
4. Once the individual test passes, re-run the full suite.
5. Repeat until all tests pass.

### Common Playwright Fixes

- **Element not found**: Check the `data-testid` attribute exists on the component. Add it if missing.
- **Timeout waiting for response**: Increase timeout or add `await page.waitForResponse(...)` before assertions.
- **Flaky test**: Add `await expect(...).toBeVisible()` before interacting with an element.
- **Chart not rendering**: The Recharts container may need time to render. Wait for a specific SVG element.
- **Filter doesn't update data**: Verify the TanStack Query hook re-fetches when the filter param changes (check `queryKey` includes the filter value).

## Step 4: Log Results

After all tests pass (or after exhausting fixes), write the results to:

```
documentation/logs/e2e-test-results.log
```

The log MUST include:
- Timestamp of the test run
- Full Playwright output (pass/fail for each test)
- For any test that required fixes:
  - What failed and the error message
  - What file was changed and what the fix was
  - Why the fix was necessary (e.g., "missing data-testid on player filter dropdown", "API response shape changed")
- Final status: ALL PASSED or list of remaining failures

## Test Files

```
e2e/
├── fixtures/
│   └── seed.ts                  # Shared seed helper
├── team-dashboard.spec.ts       # Team overview: stat cards, efficiency trend, top players
├── team-roster.spec.ts          # Roster table renders, column sorting works
├── team-games.spec.ts           # Game log table renders with real data
├── team-shots.spec.ts           # Team shot chart: player filter, game filter, quarter filter, made/missed
├── player-dashboard.spec.ts     # Player page: stat cards, career overview
├── player-shots.spec.ts         # Player shot chart: game filter, quarter filter, shot type
├── player-trends.spec.ts        # Trend chart: metric dropdown, window toggle, chart re-renders
├── standings.spec.ts            # Standings page: both conferences, correct data
└── navigation.spec.ts           # Sidebar, team selector, breadcrumbs, page transitions
```

## What Each Test Validates (Full Stack)

| Test | Frontend | API | Database |
|---|---|---|---|
| `team-dashboard.spec.ts` | Stat cards render values | `/api/teams/:id/stats` returns data | TeamSeasonStats row exists |
| `team-shots.spec.ts` | SVG dots appear, filter dropdowns populated | `/api/teams/:id/shots` applies filters | ShotChart rows with all fields |
| `player-trends.spec.ts` | Recharts renders, toggles work | `/api/players/:id/trends` returns array | PlayerGameLog rows for rolling calc |
| `player-shots.spec.ts` | Court renders, game dropdown works | `/api/players/:id/shots?gameId=` filters | ShotChart rows filtered by game |
| `standings.spec.ts` | Table renders 15 teams per conference | `/api/standings?conference=West` | Standings rows with conference |
| `navigation.spec.ts` | Links work, URLs correct | N/A (client-side routing) | N/A |

## Required data-testid Attributes

The following `data-testid` attributes MUST exist on frontend components for Playwright to find them. If any are missing, add them to the component.

```
# Team Dashboard
data-testid="stat-card-record"
data-testid="stat-efg-pct"
data-testid="stat-tov-pct"
data-testid="stat-oreb-pct"

# Shot Chart Filters
data-testid="player-filter"        (select dropdown — team shots page)
data-testid="game-filter"          (select dropdown)
data-testid="period-filter-1"      (button for Q1)
data-testid="period-filter-2"      (button for Q2)
data-testid="period-filter-3"      (button for Q3)
data-testid="period-filter-4"      (button for Q4)
data-testid="shot-type-filter-2pt" (button)
data-testid="shot-type-filter-3pt" (button)
data-testid="shot-count"           (total shots display)

# Player Trends
data-testid="metric-selector"      (select dropdown)
data-testid="window-5"             (toggle button)
data-testid="window-10"            (toggle button)
data-testid="window-15"            (toggle button)

# Team Selector (home page)
data-testid="team-card-{teamId}"   (clickable team card)
```

## Rules

- Do NOT modify ETL scripts or the Prisma schema.
- You MAY modify `src/app/**/*.tsx`, `src/components/**/*.tsx`, `src/lib/**/*.ts`, `e2e/**/*.spec.ts`, and `playwright.config.ts`.
- You MAY modify API route handlers if the issue is the API returning wrong data.
- Always re-run the full suite after any fix to check for regressions.
- If a test requires data that doesn't exist in the seed, flag it as a BLOCKER for Worker 1 (seed script owner).
