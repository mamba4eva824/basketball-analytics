# Scouting reports

Pre-game reports written with the `scouting-report` skill from `/api/matchup`, and post-game analyses written with the `postgame-report` skill. They're saved here so we can look back at them after the game, and the dashboard's Matchup → Post-game tab shows them.

- File name: `YYYY-MM-DD-LAL-at-OPP.md` for road games and `YYYY-MM-DD-OPP-at-LAL.md` for home games. The date is the game date, in US Eastern time. Post-game analyses add `-postgame` and compare the result with the pre-game keys.
- Every report states its data source and refresh date. A report built from demo data must say so at the top. Don't commit demo-data reports here.
- Numbers are a snapshot as of the refresh date. Don't edit an old report after new games; write a new one.
- A pre-game report written after the game is **backfilled** with `/api/matchup?asOf=YYYY-MM-DD` (only earlier games count) and says so at the top. Injury reports can't be backfilled.

| Date | Game | Report | Post-game |
|------|------|--------|-----------|
| 2026-10-21 | Warriors @ Lakers | [2026-10-21-GSW-at-LAL.md](2026-10-21-GSW-at-LAL.md) (backfilled, as of Oct 21) | [W 127-105](2026-10-21-GSW-at-LAL-postgame.md) |
| 2026-10-23 | Clippers @ Lakers | [2026-10-23-LAC-at-LAL.md](2026-10-23-LAC-at-LAL.md) (backfilled, as of Oct 23) | [W 125-117](2026-10-23-LAC-at-LAL-postgame.md) |
| 2026-10-25 | Lakers @ Jazz | [2026-10-25-LAL-at-UTA.md](2026-10-25-LAL-at-UTA.md) | [W 132-123](2026-10-25-LAL-at-UTA-postgame.md) |
| 2026-10-27 | Trail Blazers @ Lakers | [2026-10-27-POR-at-LAL.md](2026-10-27-POR-at-LAL.md) (backfilled, as of Oct 27) | [L 129-136](2026-10-27-POR-at-LAL-postgame.md) |
| 2026-10-28 | Lakers @ Clippers | [2026-10-28-LAL-at-LAC.md](2026-10-28-LAL-at-LAC.md) (backfilled, as of Oct 28) | [W 103-87](2026-10-28-LAL-at-LAC-postgame.md) |
| 2026-10-30 | Lakers @ Warriors | [2026-10-30-LAL-at-GSW.md](2026-10-30-LAL-at-GSW.md) (backfilled, as of Oct 30) | [L 95-112](2026-10-30-LAL-at-GSW-postgame.md) |
| 2026-11-02 | Heat @ Lakers | [2026-11-02-MIA-at-LAL.md](2026-11-02-MIA-at-LAL.md) (written just after tip-off, as of Nov 2) | [W 138-117](2026-11-02-MIA-at-LAL-postgame.md) |
