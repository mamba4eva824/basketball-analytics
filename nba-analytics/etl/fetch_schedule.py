"""
Fetch the full league schedule (past results + future games) for a season.
Populates: ScheduledGame table.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import re
from datetime import datetime, timezone

from nba_api.stats.endpoints import ScheduleLeagueV2

from config import CURRENT_SEASON_YEAR
from utils import get_db, safe_call, safe_int, upsert_rows

from sqlalchemy import text


# gameId prefixes: 001 preseason, 002 regular season, 003 All-Star,
# 004 playoffs, 005 play-in, 006 NBA Cup championship
REGULAR_SEASON_PREFIX = '002'
PLAYOFF_PREFIX = '004'
PLAY_IN_PREFIX = '005'
CUP_FINAL_PREFIX = '006'
KEPT_PREFIXES = (REGULAR_SEASON_PREFIX, PLAYOFF_PREFIX, PLAY_IN_PREFIX, CUP_FINAL_PREFIX)

STATUS_FINAL = 3

SCHEDULE_COLUMNS = [
    'gameId', 'season', 'seasonId', 'gameDateUtc', 'gameDateEt',
    'status', 'statusText', 'homeTeamId', 'awayTeamId',
    'homeScore', 'awayScore', 'arena', 'arenaCity',
    'nationalTv', 'gameLabel', 'isPlayoff',
    'createdAt', 'updatedAt',
]

_NATIONAL_TV_COL = re.compile(r'^nationalBroadcasters(_\d+)?_broadcasterDisplay$')


def _clean_str(val):
    """Strip a value to a non-empty string, or None (handles NaN/None/'')."""
    if val is None:
        return None
    if isinstance(val, float) and val != val:
        return None
    s = str(val).strip()
    if s == '' or s.lower() in ('nan', 'none'):
        return None
    return s


def normalize_game_id(val):
    """NBA game IDs are 10-char zero-padded strings; repair ones that lost leading zeros."""
    s = _clean_str(val)
    if s is None:
        return None
    if s.endswith('.0'):
        s = s[:-2]
    return s.zfill(10) if s.isdigit() else s


def parse_utc_datetime(val):
    """Parse an ISO timestamp like '2026-10-21T23:30:00Z' into a naive UTC datetime."""
    s = _clean_str(val)
    if s is None:
        return None
    try:
        dt = datetime.fromisoformat(s.replace('Z', '+00:00'))
    except ValueError:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _et_date(row):
    """Local (ET) calendar date 'YYYY-MM-DD' from gameDateEst / gameDateTimeEst / gameDate."""
    for key in ('gameDateEst', 'gameDateTimeEst'):
        s = _clean_str(row.get(key))
        if s and re.match(r'^\d{4}-\d{2}-\d{2}', s):
            return s[:10]
    s = _clean_str(row.get('gameDate'))  # e.g. '10/21/2026 00:00:00'
    if s:
        try:
            return datetime.strptime(s[:10], '%m/%d/%Y').strftime('%Y-%m-%d')
        except ValueError:
            pass
    return None


def _team_id(val):
    tid = safe_int(val)
    if tid is None or tid <= 0:
        return None  # TBD playoff slots use teamId 0
    return str(tid)


def _national_tv(row, columns):
    names = []
    for col in columns:
        if _NATIONAL_TV_COL.match(col):
            name = _clean_str(row.get(col))
            if name and name not in names:
                names.append(name)
    return ' / '.join(names) if names else None


def transform_schedule(df, season, known_team_ids=None):
    """
    Map a ScheduleLeagueV2 SeasonGames DataFrame to ScheduledGame rows.

    Keeps regular season (002), play-in (005), playoffs (004) and the NBA Cup
    championship (006); drops preseason (001) and All-Star (003). Drops games whose
    teams are TBD (teamId 0) or not in known_team_ids (when given).
    """
    if df is None or df.empty:
        return []

    known = {str(t) for t in known_team_ids} if known_team_ids is not None else None
    columns = list(df.columns)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = {}

    for _, row in df.iterrows():
        game_id = normalize_game_id(row.get('gameId'))
        if not game_id or not game_id.startswith(KEPT_PREFIXES):
            continue

        home_id = _team_id(row.get('homeTeam_teamId'))
        away_id = _team_id(row.get('awayTeam_teamId'))
        if not home_id or not away_id:
            continue
        if known is not None and (home_id not in known or away_id not in known):
            continue

        game_dt = parse_utc_datetime(row.get('gameDateTimeUTC')) or parse_utc_datetime(row.get('gameDateUTC'))
        game_date_et = _et_date(row)
        if game_dt is None or game_date_et is None:
            continue

        status = safe_int(row.get('gameStatus'), 1)
        is_final = status == STATUS_FINAL

        rows[game_id] = {
            'gameId': game_id,
            'season': season,
            'seasonId': season,
            'gameDateUtc': game_dt,
            'gameDateEt': game_date_et,
            'status': status,
            'statusText': _clean_str(row.get('gameStatusText')),
            'homeTeamId': home_id,
            'awayTeamId': away_id,
            'homeScore': safe_int(row.get('homeTeam_score')) if is_final else None,
            'awayScore': safe_int(row.get('awayTeam_score')) if is_final else None,
            'arena': _clean_str(row.get('arenaName')),
            'arenaCity': _clean_str(row.get('arenaCity')),
            'nationalTv': _national_tv(row, columns),
            'gameLabel': _clean_str(row.get('gameLabel')),
            'isPlayoff': game_id.startswith(PLAYOFF_PREFIX),
            'createdAt': now,
            'updatedAt': now,
        }

    return list(rows.values())


def fetch_schedule(season=None):
    """Fetch ScheduleLeagueV2 for a season and upsert ScheduledGame rows. Returns the row count."""
    if season is None:
        season = CURRENT_SEASON_YEAR

    print(f"[SCHEDULE] Fetching league schedule for {season}...")
    dfs = safe_call(ScheduleLeagueV2, season=season)
    if not dfs or dfs[0].empty:
        print(f"  No schedule data for {season}")
        return 0

    with get_db() as session:
        known_team_ids = {r[0] for r in session.execute(text('SELECT "id" FROM "Team"'))}

    rows = transform_schedule(dfs[0], season, known_team_ids)
    print(f"  {len(rows)} games kept (of {len(dfs[0])} schedule rows)")

    with get_db() as session:
        count = upsert_rows(
            session, 'ScheduledGame', rows, SCHEDULE_COLUMNS,
            ['gameId'],
            exclude_from_update={'createdAt'},
        )
        session.commit()
        print(f"  [OK] Upserted {count} ScheduledGame records")

    return count


if __name__ == '__main__':
    fetch_schedule()
