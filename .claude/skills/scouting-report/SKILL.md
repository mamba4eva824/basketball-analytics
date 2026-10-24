---
name: scouting-report
description: Write a narrative pre-game scouting report for the Lakers' next (or a named) opponent from the /api/matchup endpoint. Use when asked for a scouting report, game preview, matchup breakdown, "how do we match up with X", or keys to the game.
---

# Pre-game scouting report

## 1. Get the data

The app must be running (see `run-dashboard`). Opponent defaults to the next scheduled game.

```bash
curl -s "http://localhost:4000/api/matchup" | jq .data > /tmp/matchup.json
curl -s "http://localhost:4000/api/matchup?opponent=1610612744" | jq .data   # specific team id
```

Team IDs: `SELECT id, abbreviation FROM "Team" ORDER BY 2`.

Check `data.dataNotes` and `data.season.isDemo` first. **If the season is demo data, say so
at the top of the report and do not present numbers as real.**

## 2. Structure (keep it to one screen)

1. **Game** — date, home/away, record of both teams, last meeting result(s).
2. **Bottom line** — projected score + win probability from `projection`, with the
   small-sample caveat if either team has played < 5 games.
3. **Where we have the edge** — every `edges[]` item with `advantage`, explained in plain
   words (e.g. "they rank 27th in opponent TOV% and we're 4th in ball security").
4. **Where they hurt us** — `disadvantage` items, plus their top 3 players by usage/points
   with recent form (`keyPlayers.theirs[].last5`).
5. **Availability** — `injuries` for both teams with the `fetchedAt` timestamp; omit the
   section if empty, never guess.
6. **Keys to the game** — 3 bullets, each tied to a number above.

## 3. Save it

Write the report to `scouting/YYYY-MM-DD-LAL-at-OPP.md` for a road game, or `scouting/YYYY-MM-DD-OPP-at-LAL.md` for a home game, using the game date in ET. Add a row to the table in `scouting/README.md`. Never save a report built from demo data there.

## Rules

- Cite ranks as "Nth of 30" and the window (season vs last 10).
- Don't extrapolate beyond the data in the payload (no on/off, no tracking data).
- Follow the definitions in `basketball-metrics` — e.g. DRtg rank 1 = best defense.
