# Agent Prompt: Run All Test Suites

You are the **Test Runner Agent**. Your job is to execute all three test suites for the NBA Analytics Dashboard in order, fix failures iteratively, and log everything.

## Test Execution Order (STRICT)

Tests MUST run in this order because each layer depends on the one before it:

1. **ETL Validation (pytest)** — validates the data in the database is correct
2. **API Unit Tests (Vitest)** — validates the API reads correct data and returns proper shapes
3. **E2E Tests (Playwright)** — validates the full stack renders correctly in a browser

Do NOT skip ahead. If ETL tests fail, the API tests will fail on bad data. If API tests fail, E2E tests will fail on broken responses.

---

## Pre-Flight: Environment Check

Before running any tests, verify the environment:

```bash
cd /Users/christopherweinreich/Documents/Projects/basketball_analytics

# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Check test database exists (create if not)
psql postgresql://postgres:postgres@localhost:5432 -c "CREATE DATABASE nba_analytics_test;" 2>/dev/null || echo "Test DB already exists"

# Check Python env
source etl-env/bin/activate
python -c "import nba_api, pandas, psycopg2, sqlalchemy, pytest; print('Python deps: OK')"

# Check Node deps
cd nba-analytics
npx prisma validate && echo "Prisma schema: OK"
npx tsc --noEmit && echo "TypeScript: OK"
```

If any pre-flight check fails, fix it before proceeding. Log the issue.

---

## Phase 1: Reset & Seed Test Database

```bash
cd /Users/christopherweinreich/Documents/Projects/basketball_analytics/nba-analytics
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nba_analytics_test"

npx prisma db push --force-reset
npx tsx scripts/seed-test-data.ts
```

If the seed script fails, read the error, fix `scripts/seed-test-data.ts`, and re-run. Do not proceed until seeding succeeds.

---

## Phase 2: ETL Validation (pytest)

Read the full prompt at: `prompts/run-etl-tests.md`

```bash
cd /Users/christopherweinreich/Documents/Projects/basketball_analytics
source etl-env/bin/activate
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nba_analytics_test"
cd etl
python -m pytest tests/ -v --tb=long 2>&1 | tee ../documentation/logs/etl-test-results.log
```

**If tests fail:**
- Read the failure. Fix the ETL script or test.
- Re-run until all pass.
- Log every fix to `documentation/logs/etl-test-results.log`.

**Gate:** ALL ETL tests must pass before moving to Phase 3.

---

## Phase 3: API Unit Tests (Vitest)

Read the full prompt at: `prompts/run-unit-tests.md`

```bash
cd /Users/christopherweinreich/Documents/Projects/basketball_analytics/nba-analytics
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nba_analytics_test"
npx vitest run --reporter=verbose 2>&1 | tee ../documentation/logs/unit-test-results.log
```

**If tests fail:**
- Read the failure. Fix the API route, test, or shared utility.
- Re-run until all pass.
- Log every fix to `documentation/logs/unit-test-results.log`.

**Gate:** ALL unit tests must pass before moving to Phase 4.

---

## Phase 4: E2E Tests (Playwright)

Read the full prompt at: `prompts/run-e2e-tests.md`

```bash
cd /Users/christopherweinreich/Documents/Projects/basketball_analytics/nba-analytics
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nba_analytics_test"
npx playwright test --reporter=list 2>&1 | tee ../documentation/logs/e2e-test-results.log
```

Note: Playwright will start the dev server automatically via `playwright.config.ts` `webServer` config. If it doesn't, start it manually:
```bash
# In a separate process
npm run dev &
sleep 5
npx playwright test --reporter=list
```

**If tests fail:**
- Read the failure. Common issues:
  - Missing `data-testid` on a component → add it
  - Timeout waiting for data → add `waitForResponse` or increase timeout
  - Chart not rendering → wait for specific SVG element
  - Filter not updating → check TanStack Query `queryKey` includes the filter param
- Fix the component, API route, or test.
- Re-run until all pass.
- Log every fix to `documentation/logs/e2e-test-results.log`.

---

## Phase 5: Final Report

After all three suites pass, write a summary to:

```
documentation/logs/test-summary.log
```

The summary MUST include:

```
# Test Suite Summary
Date: [timestamp]

## ETL Validation (pytest)
- Total tests: [N]
- Passed: [N]
- Failed: [N]
- Fixes required: [list each fix with file + description, or "None"]

## API Unit Tests (Vitest)
- Total tests: [N]
- Passed: [N]
- Failed: [N]
- Fixes required: [list each fix with file + description, or "None"]

## E2E Tests (Playwright)
- Total tests: [N]
- Passed: [N]
- Failed: [N]
- Fixes required: [list each fix with file + description, or "None"]

## Files Modified During Testing
- [file path]: [what changed and why]

## Final Status: [ALL PASSED / PARTIAL — see remaining failures]
```

---

## Rules

- Run suites in order. Do not skip ahead.
- Fix failures iteratively. Do not give up after one attempt.
- Log EVERYTHING — the user needs to see what broke and what you changed.
- If a fix in one layer breaks a previously passing layer, re-run the earlier suite to catch regressions.
- If you hit a blocker you cannot fix (e.g., database won't connect, missing dependency), log it clearly and stop.
- Do NOT modify the Prisma schema without flagging it. Schema changes affect all layers.
