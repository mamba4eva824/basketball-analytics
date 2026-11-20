"""
Fetch NBA.com on/off totals for each focus-team game ("When Luka sits" trend, /without-luka).
Populates: LineupGroupGameStats.

For each regular-season focus-team game in GameBoxScore that isn't loaded yet, two
stats.nba.com calls (PerMode=Totals): TeamPlayerOnOffDetails Base + Opponent with
DateFrom = DateTo = the game date (a team plays at most once a day). Each gives the team's
totals for that game (groupSize 0) and each player's on-court totals (groupSize 1), so the
app gets "player off the floor" per game as team − player, the same way as LineupGroupStats.

Games are independent: each game's rows are replaced together; a game whose Base or
Opponent call fails is skipped and retried on the next run (the step then reports the
failure); a game whose team totals don't cover a full game yet (NBA.com still processing)
is not written. Games from the last REFRESH_DAYS are fetched again so NBA.com's stat
corrections reach the trend the same way they reach the season totals.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime, timedelta

from sqlalchemy import text
from nba_api.stats.endpoints import TeamPlayerOnOffDetails

from config import CURRENT_SEASON_YEAR, LAKERS_TEAM_ID
from utils import get_db, safe_call, generate_cuid, upsert_rows, execute_sql
from fetch_lineup_groups import OPP_STAT_COLUMNS, TEAM_STAT_COLUMNS, transform_on_off

# re-fetch recent games: NBA.com corrects box scores for a day or two after a game
REFRESH_DAYS = 3

# a regulation game is 48 team minutes; less means NBA.com hasn't finished the game's totals
FULL_GAME_MINUTES = 47.5

LINEUP_GAME_COLUMNS = [
    'id', 'teamId', 'season', 'seasonId', 'gameId', 'gameDate', 'groupSize', 'groupKey', 'minutes',
    *TEAM_STAT_COLUMNS.keys(), 'plusMinus', *OPP_STAT_COLUMNS.keys(),
    'createdAt', 'updatedAt',
]


# ── Pure transforms ──────────────────────────────────────────────────────────

def games_to_fetch(games, loaded_game_ids, today=None, refresh_days=REFRESH_DAYS):
    """
    Focus-team games (dicts with gameId, gameDate) to fetch, oldest first: every game not loaded
    yet, plus loaded games played within the last `refresh_days` days (stat corrections).
    """
    have = set(loaded_game_ids)
    cutoff = (today or datetime.utcnow()) - timedelta(days=refresh_days)
    todo = (g for g in games if g['gameId'] not in have or g['gameDate'] >= cutoff)
    return sorted(todo, key=lambda g: (g['gameDate'], g['gameId']))


def nba_date(d):
    """stats.nba.com DateFrom/DateTo format: MM/DD/YYYY."""
    return d.strftime('%m/%d/%Y')


def transform_game_on_off(base_frames, opp_frames, team_id, season, game_id, game_date, now=None):
    """
    TeamPlayerOnOffDetails frames for one game date → LineupGroupGameStats rows.
    Returns [] when the team's totals are missing or don't cover a full game yet.
    """
    now = now or datetime.utcnow()
    rows = transform_on_off(base_frames, opp_frames, team_id, season, now)
    team = next((r for r in rows if r['groupSize'] == 0), None)
    if team is None or team['minutes'] < FULL_GAME_MINUTES:
        return []
    out = []
    for r in rows:
        r = {k: v for k, v in r.items() if k != 'gamesPlayed'}
        r.update({'id': generate_cuid(), 'gameId': game_id, 'gameDate': game_date})
        out.append(r)
    return out


# ── Fetch + load ─────────────────────────────────────────────────────────────

def _load_games(session, team_id, season):
    games = session.execute(text(
        'SELECT "gameId", "gameDate" FROM "GameBoxScore" '
        'WHERE "season" = :s AND "isPlayoff" = false AND (:t IN ("homeTeamId", "awayTeamId"))'
    ), {'s': season, 't': team_id})
    loaded = session.execute(text(
        'SELECT DISTINCT "gameId" FROM "LineupGroupGameStats" '
        'WHERE "teamId" = :t AND "season" = :s AND "groupSize" = 0'
    ), {'s': season, 't': team_id})
    return [{'gameId': g[0], 'gameDate': g[1]} for g in games], [r[0] for r in loaded]


def fetch_lineup_games(season=None, team_id=None):
    """Fetch per-game on/off totals for focus-team games not loaded yet. Returns the rows written."""
    season = season or CURRENT_SEASON_YEAR
    team_id = str(team_id or LAKERS_TEAM_ID)
    print(f"[LINEUP GAMES] Team {team_id}, season {season}...")

    with get_db() as session:
        games, loaded = _load_games(session, team_id, season)
    todo = games_to_fetch(games, loaded)
    print(f"  {len(games)} games, {len(loaded)} loaded, {len(todo)} to fetch (new + last {REFRESH_DAYS} days)")

    written, failed, pending = [], [], []
    for g in todo:
        day = nba_date(g['gameDate'])
        common = dict(team_id=team_id, season=season, season_type_all_star='Regular Season',
                      per_mode_detailed='Totals', date_from_nullable=day, date_to_nullable=day)
        try:
            base = safe_call(TeamPlayerOnOffDetails, measure_type_detailed_defense='Base', **common)
        except Exception as e:
            print(f"    [WARN] {g['gameId']} ({day}) Base: {e}")
            failed.append(g['gameId'])
            continue
        try:
            opp = safe_call(TeamPlayerOnOffDetails, measure_type_detailed_defense='Opponent', **common)
        except Exception as e:
            # don't store the game without opponent totals: it would never be fetched again
            print(f"    [WARN] {g['gameId']} ({day}) Opponent: {e}")
            failed.append(g['gameId'])
            continue
        rows = transform_game_on_off(base, opp, team_id, season, g['gameId'], g['gameDate'])
        if not rows:
            pending.append(g['gameId'])
            continue
        with get_db() as session:
            execute_sql(session, 'DELETE FROM "LineupGroupGameStats" WHERE "teamId" = :t AND "gameId" = :g',
                        {'t': team_id, 'g': g['gameId']})
            upsert_rows(session, 'LineupGroupGameStats', rows, LINEUP_GAME_COLUMNS,
                        ['teamId', 'gameId', 'groupKey'], exclude_from_update={'id', 'createdAt'})
        written.extend(rows)
        print(f"  {g['gameId']} ({day}): {len(rows)} rows")

    if pending:
        print(f"  {len(pending)} game(s) not complete on NBA.com yet; will retry next run: {', '.join(pending)}")
    print(f"  [OK] Wrote {len(written)} LineupGroupGameStats rows for {len(todo) - len(failed) - len(pending)} game(s)")
    if failed:
        raise RuntimeError(f"Per-game on/off not fetched for {len(failed)} game(s) (retried next run): {', '.join(failed)}")
    return written


if __name__ == '__main__':
    fetch_lineup_games()
