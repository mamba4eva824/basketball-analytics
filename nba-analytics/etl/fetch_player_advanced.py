"""
Per-game player advanced stats from NBA.com (BoxScoreAdvancedV3), focus team's games.
Populates PlayerGameLog: usageRate, offRating, defRating, netRating, assistPct, reboundPct,
pace, trueShootingPct, effectiveFgPct — for both teams' players in each game.

Incremental: one call per focus-team game that has no advanced stats yet (none of its focus-team
rows has a usage rate or offensive rating), so a daily refresh makes ~1 call per new game; the
first run backfills the season. A failed call, or a game whose advanced box score isn't published
yet, is retried on the next run (only failed calls count toward failing the step).

Deliberately not written: `started` (the Starters step owns it) and `pir` — NBA.com's PIE is not a
PIR, and storing it there would relabel one stat as another (CLAUDE.md data rule 1).
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from nba_api.stats.endpoints import BoxScoreAdvancedV3
from sqlalchemy import text

from config import CURRENT_SEASON_YEAR, LAKERS_TEAM_ID
import re

from utils import get_db, safe_call, safe_float, safe_int, pct_to_decimal, parse_minutes

# PlayerGameLog column -> BoxScoreAdvancedV3 PlayerStats column
RATING_COLUMNS = {
    'offRating': 'offensiveRating',
    'defRating': 'defensiveRating',
    'netRating': 'netRating',
    'pace': 'pace',
}
PCT_COLUMNS = {
    'usageRate': 'usagePercentage',
    'assistPct': 'assistPercentage',
    'reboundPct': 'reboundPercentage',
    'trueShootingPct': 'trueShootingPercentage',
    'effectiveFgPct': 'effectiveFieldGoalPercentage',
}
ADVANCED_FIELDS = [*RATING_COLUMNS, *PCT_COLUMNS]


# ── Pure transforms ──────────────────────────────────────────────────────────

_ISO_MINUTES = re.compile(r'^PT(\d+)M([\d.]+)S$')


def played(minutes):
    """Positive minutes: 'MM:SS' or a number (utils.parse_minutes), or an ISO 'PT34M12.00S' duration."""
    if isinstance(minutes, str):
        m = _ISO_MINUTES.match(minutes.strip())
        if m:
            return int(m.group(1)) * 60 + float(m.group(2)) > 0
    decimal, _ = parse_minutes(minutes)
    return bool(decimal and decimal > 0)


def player_stats_frame(frames):
    """The PlayerStats data set (has personId and usagePercentage)."""
    return next((d for d in (frames or []) if d is not None and 'personId' in d.columns and 'usagePercentage' in d.columns), None)


def transform_player_advanced(df):
    """BoxScoreAdvancedV3 PlayerStats -> update rows for players who played (percentages as 0-1)."""
    if df is None or df.empty:
        return []
    rows = []
    for _, r in df.iterrows():
        if not played(r.get('minutes')):
            continue
        pid, gid, tid = safe_int(r.get('personId')), r.get('gameId'), safe_int(r.get('teamId'))
        if not pid or not tid or gid is None:
            continue
        row = {'playerId': str(pid), 'gameId': str(gid).zfill(10), 'teamId': str(tid)}
        for col, src in RATING_COLUMNS.items():
            row[col] = safe_float(r.get(src))
        for col, src in PCT_COLUMNS.items():
            row[col] = pct_to_decimal(r.get(src))
        rows.append(row)
    return rows


# ── Fetch + load ─────────────────────────────────────────────────────────────

GAMES_MISSING_SQL = '''
    SELECT g."gameId" FROM "GameBoxScore" g
    WHERE g."season" = :season
      AND (g."homeTeamId" = :tid OR g."awayTeamId" = :tid)
      AND EXISTS (SELECT 1 FROM "PlayerGameLog" p
                  WHERE p."gameId" = g."gameId" AND p."teamId" = :tid AND p."minutes" > 0)
      AND NOT EXISTS (SELECT 1 FROM "PlayerGameLog" p
                      WHERE p."gameId" = g."gameId" AND p."teamId" = :tid
                        AND (p."usageRate" IS NOT NULL OR p."offRating" IS NOT NULL))
    ORDER BY g."gameDate"
'''

UPDATE_SQL = text('UPDATE "PlayerGameLog" SET ' + ', '.join(f'"{c}" = :{c}' for c in ADVANCED_FIELDS)
                  + ', "updatedAt" = NOW() WHERE "playerId" = :playerId AND "gameId" = :gameId AND "teamId" = :teamId')


def fetch_focus_team_player_advanced(season=None, team_id=LAKERS_TEAM_ID):
    """Fill per-game advanced stats for the focus team's games that don't have them. Returns rows updated."""
    season = season or CURRENT_SEASON_YEAR
    team_id = str(team_id)
    print(f"[PLAYER ADVANCED] Per-game usage and ratings for team {team_id} games in {season}...")

    with get_db() as session:
        game_ids = [r[0] for r in session.execute(text(GAMES_MISSING_SQL), {'season': season, 'tid': team_id})]
    print(f"  {len(game_ids)} game(s) need advanced stats")

    updated = 0
    failures = []
    pending = []
    for game_id in game_ids:
        try:
            frames = safe_call(BoxScoreAdvancedV3, game_id=game_id)
        except Exception as e:  # one bad game shouldn't stop the rest; retried next run
            print(f"    [WARN] Game {game_id}: advanced box score unavailable ({e})")
            failures.append(game_id)
            continue
        rows = transform_player_advanced(player_stats_frame(frames))
        if not rows:
            # usually published a few hours after the final; not an error, picked up next run
            print(f"    [INFO] Game {game_id}: advanced box score not published yet — retried next run")
            pending.append(game_id)
            continue
        with get_db() as session:
            for row in rows:
                result = session.execute(UPDATE_SQL, row)
                updated += result.rowcount or 0

    print(f"  [OK] Updated {updated} PlayerGameLog rows ({len(failures)} game(s) failed, {len(pending)} not published yet; both retried next run)")
    if game_ids and len(failures) == len(game_ids):
        raise RuntimeError(f"All {len(failures)} advanced box score calls failed")
    return updated


if __name__ == '__main__':
    fetch_focus_team_player_advanced()
