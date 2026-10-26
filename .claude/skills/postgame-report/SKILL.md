---
name: postgame-report
description: Write a post-game analysis of a finished Lakers game from the NBA live feed (final box score + play-by-play) and grade it against that game's pre-game scouting report. Use when asked for a post-game report, recap, game breakdown, "how did we win/lose", or "how did the keys to the game hold up".
---

# Post-game report

## 1. Get the data

Find the game id: `scouting/` filenames give the date; the id is in `ScheduledGame` (or the
In-game tab's URL / `/api/live`). Then, from `nba-analytics/` on a **home connection** (the
NBA feed blocks cloud IPs; no dev server or DB needed):

```bash
npx tsx scripts/postgame-data.ts 0022600112 > /tmp/postgame.json
```

It prints `PostgameFacts` (`src/lib/analytics/postgame.ts`): the full game view
(`game`: scores by period, four factors, scoring splits, every player line), per-period
team splits, checkpoints, unanswered runs (7+), each side's best net stretch, when the lead
was taken for good, the last-5-minutes stretch with scorers, and the top-3 scorers by period.
The feed keeps play-by-play for past games, so this works days later.

**Exit code ≠ 0 means stop:** 1 = not final yet (or no box score), 2 = bad id / not a
Lakers game, or a line on stderr starting `CHECK FAILED` (periods, player points or
play-by-play don't add up to the final). Don't write a report from numbers that fail a check.

Then open the pre-game report for the same game (`scouting/YYYY-MM-DD-…md`) for its keys,
projection and the "coming in" numbers you'll compare against.

## 2. Structure

Lead with the result and the one-sentence story. Every claim cites a number from the JSON.

1. **Result** — final, record after the game, line score table (`game.focus/opponent.periods`).
   One line each on the comeback or blowout (`bestStretch`), lead changes / ties, and when the
   lead was taken for good (`leadForGood`), with the score.
2. **How it happened** — one bullet per period from `periods[tricode][i]` (shooting, threes,
   FTs, turnovers, offensive rebounds) plus `runs`. Close with the final stretch
   (`closing`: score at 5:00 left, points each side, who scored them).
3. **Four factors** — table from `game.*.factors` (ORtg, eFG%, TOV%, OREB%, FTA rate) with the
   side that won each; then the scoring splits that explain it (paint, second chance, fast
   break, off turnovers, bench).
4. **Players** — the focus team's standouts (line, TS%, +/-; `scorerPeriods` when a quarter
   carried the night) and the opponent's top 3–4. Mention a notable non-scoring +/- only as
   context — single-game +/- is noise.
5. **Against the pre-game report** — table: each pre-game key, the "coming in" number, tonight's
   number, ✅ / ⚠️ / ❌. Also grade the projection (winner, score, pace).
6. **Takeaways** — 3 bullets, each tied to a number above; point at the next opponent's
   relevant rank when it makes the takeaway actionable (check `/api/matchup` for it).

## 3. Save it

`scouting/YYYY-MM-DD-LAL-at-OPP-postgame.md` (or `…-OPP-at-LAL-postgame.md`), same date as the
pre-game file. First lines: data source (live feed, game id, when pulled) and a link to the
pre-game report. Add the link to the game's row in `scouting/README.md` (Post-game column).
The dashboard's Matchup → **Post-game** tab lists every `*-postgame.md` in `scouting/` and renders
it (GitHub-flavoured markdown: tables, lists, links to the pre-game file all work), so the file
name must follow the pattern exactly — anything else won't show up.

## Rules

- Follow `basketball-metrics` (live-game section): ratings and four factors are box-score
  estimates over ~100 possessions — say so once at the top. Percentages from the JSON are
  0–1 decimals; format them at write time.
- Grade keys against what the pre-game report actually said, quoting its numbers; don't
  re-derive "coming in" numbers from today's data (they now include this game).
- Never fill a gap: if a stat isn't in the JSON (on/off, tracking, shot quality), leave it out.
- A game that's final in the feed may still be partial in Supabase for a few minutes (see
  `refresh-nba-data`); this report doesn't depend on the DB, but don't cite season numbers
  from the dashboard until the post-game refresh has run.
