---
name: run-dashboard
description: Start the Lakers analytics app locally (Postgres + Prisma + Next.js on port 4000), seed it with demo or real data, and screenshot pages to verify a UI change. Use when asked to run, start, preview, demo or screenshot the dashboards, or to confirm a frontend change works in the real app.
---

# Run the dashboards locally

All commands run from `nba-analytics/`.

## 1. Postgres

Pick whichever is available:

```bash
# Docker
docker run -d --name nba-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=nba_analytics -p 5432:5432 postgres:16
# Or a local cluster (Debian/Ubuntu)
pg_ctlcluster 16 main start && sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres'" -c "CREATE DATABASE nba_analytics"
# macOS: brew services start postgresql@16 && createdb nba_analytics
```

`.env` (git-ignored, template in `.env.example`) must contain one `DATABASE_URL`:

- **Real data:** the Supabase Session pooler string (project "Lakers Analytics West"); skip the
  local Postgres setup and `prisma db push` (the schema is already applied there).
- **Offline/demo:** `postgresql://postgres:postgres@localhost:5432/nba_analytics`.

## 2. Schema + client

```bash
npm ci
npx prisma db push      # no migrations dir — db push syncs schema.prisma
npx prisma generate     # client is generated into src/generated/prisma (git-ignored)
```

## 3. Data — choose one

- **Real data** (needs network access to stats.nba.com — home connection, not a cloud VM):
  follow the `refresh-nba-data` skill (`etl-env/bin/python etl/refresh.py`).
- **Demo data** (offline, synthetic, labelled "(demo data)" in the header):
  `npx tsx scripts/seed-demo-data.ts`. It wipes the DB first — **only ever against local
  Postgres, never Supabase**. Never screenshot demo data and call it real.

## 4. Start

```bash
npm run dev -- -p 4000
```

Pages: `http://localhost:4000/` (Lakers dashboard), `/matchup` (next opponent),
`/matchup?opponent=1610612744` (pick any team ID), `/standings`, `/players/<id>`.

## 5. Screenshot to verify (Playwright is preinstalled)

```js
// save as /tmp/shot.mjs, run with: node /tmp/shot.mjs
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
for (const [name, url] of [['home', '/'], ['matchup', '/matchup']]) {
  await p.goto('http://localhost:4000' + url, { waitUntil: 'networkidle' });
  await p.screenshot({ path: `/tmp/${name}.png`, fullPage: true });
}
await b.close();
```

Check both themes (toggle in header, or `localStorage.theme = 'light'`) and a 390 px wide
viewport — the layout must not scroll horizontally.

## Troubleshooting

- `Environment variable not found: DATABASE_URL` → `.env` missing, or a script that doesn't
  load dotenv (seed scripts import `dotenv/config`).
- Empty dashboard with "No games yet" → the season has no rows; check
  `SELECT season, count(*) FROM "GameBoxScore" GROUP BY 1` and `CURRENT_SEASON`.
- Port already in use → `lsof -i :4000` or pick another port (tests assume 4000).
