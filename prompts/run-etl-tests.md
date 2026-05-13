# Agent Prompt: Run ETL Validation Tests

You are a testing agent responsible for running and fixing the **ETL validation test suite** (pytest) for the NBA Analytics Dashboard.

## Context

The ETL pipeline (`etl/`) pulls NBA data from `nba_api` and loads it into PostgreSQL. These tests validate that the ETL scripts:
- Store all required columns (especially the 15 ShotChartDetail fields for frontend filtering)
- Produce no duplicate rows on re-runs (upsert idempotency)
- Write efficiency estimates within realistic NBA ranges (85-135 for OffRtg/DefRtg)
- Populate all tables defined in the Prisma schema

## Step 1: Setup

```bash
cd /Users/christopherweinreich/Documents/Projects/basketball_analytics
source etl-env/bin/activate
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nba_analytics_test"

# Reset test database
cd nba-analytics
npx prisma db push --force-reset
npx tsx scripts/seed-test-data.ts
cd ..
```

## Step 2: Run the Tests

```bash
cd etl
python -m pytest tests/ -v --tb=long 2>&1 | tee ../documentation/logs/etl-test-results.log
```

## Step 3: If Tests Fail

1. Read the failure output carefully. Identify which test failed and why.
2. Determine if the fix belongs in:
   - `etl/*.py` (ETL script bug — e.g., dropping a column, bad upsert logic)
   - `etl/tests/*.py` (test itself is wrong — e.g., wrong column name, bad assertion)
   - `prisma/schema.prisma` (schema mismatch — flag as BLOCKER for Worker 1)
3. Fix the code. Re-run the failing test in isolation first:
   ```bash
   python -m pytest tests/test_fetch_shots.py -v --tb=long
   ```
4. Once the individual test passes, re-run the full suite.
5. Repeat until all tests pass.

## Step 4: Log Results

After all tests pass (or after exhausting fixes), write the results to:

```
documentation/logs/etl-test-results.log
```

The log MUST include:
- Timestamp of the test run
- Full pytest output (pass/fail for each test)
- For any test that required fixes:
  - What failed and the error message
  - What file was changed and what the fix was
  - Why the fix was necessary
- Final status: ALL PASSED or list of remaining failures

## Test Files

```
etl/tests/
├── conftest.py                  # DB connection fixture, constants
├── test_fetch_teams.py          # All 30 teams upserted, no duplicates
├── test_fetch_players.py        # Player records match roster count
├── test_fetch_game_logs.py      # Game log column completeness, no nulls on required fields
├── test_fetch_shots.py          # ALL 15 ShotChartDetail fields stored (critical for frontend)
├── test_fetch_efficiency.py     # TeamGameEfficiency + TeamEfficiencySnapshot populated, values in range
├── test_fetch_standings.py      # 30 rows, correct conference assignment
└── test_upsert_idempotency.py   # Run ETL twice, verify no duplicate rows
```

## Rules

- Do NOT modify the Prisma schema. If it's wrong, log it as a blocker.
- Do NOT modify API routes or frontend code.
- You MAY modify `etl/*.py` scripts and `etl/tests/*.py` test files.
- Always re-run the full suite after any fix to check for regressions.
