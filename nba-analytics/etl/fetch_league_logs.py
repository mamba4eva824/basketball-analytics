"""
League-wide game logs: one LeagueGameLog call for every team game and one for every
player game in a season, plus starter flags for the focus team's games.
Populates: GameBoxScore, PlayerGameLog (and PlayerGameLog.started).
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime, timezone

from nba_api.stats.endpoints import LeagueGameLog, BoxScoreTraditionalV3

from config import CURRENT_SEASON_YEAR, LAKERS_TEAM_ID
from fetch_schedule import normalize_game_id, PLAYOFF_PREFIX
from utils import (
    get_db, safe_call, generate_cuid, safe_int, safe_float,
    pct_to_decimal, parse_date, parse_minutes, upsert_rows,
)

from sqlalchemy import text


GAME_BOX_COLUMNS = [
    'id', 'gameId', 'gameDate', 'season', 'seasonId',
    'homeTeamId', 'awayTeamId',
    'homePoints', 'homeFieldGoals', 'homeFieldGoalAtt', 'homeFieldGoalPct',
    'homeThreePointers', 'homeThreePointAtt', 'homeThreePointPct',
    'homeFreeThrows', 'homeFreeThrowAtt', 'homeFreeThrowPct',
    'homeReboundsOff', 'homeReboundsDef', 'homeReboundsTotal',
    'homeAssists', 'homeSteals', 'homeBlocks', 'homeTurnovers',
    'homePersonalFouls', 'homeFastBreakPts', 'homePtsInPaint',
    'homePtsOffTurnovers', 'homeSecondChancePts',
    'awayPoints', 'awayFieldGoals', 'awayFieldGoalAtt', 'awayFieldGoalPct',
    'awayThreePointers', 'awayThreePointAtt', 'awayThreePointPct',
    'awayFreeThrows', 'awayFreeThrowAtt', 'awayFreeThrowPct',
    'awayReboundsOff', 'awayReboundsDef', 'awayReboundsTotal',
    'awayAssists', 'awaySteals', 'awayBlocks', 'awayTurnovers',
    'awayPersonalFouls', 'awayFastBreakPts', 'awayPtsInPaint',
    'awayPtsOffTurnovers', 'awaySecondChancePts',
    'arena', 'attendance', 'isPlayoff', 'seriesId',
    'createdAt', 'updatedAt',
]

# GameBoxScore fields filled by other fetchers; never overwritten from LeagueGameLog
GAME_BOX_PRESERVE = {
    'id', 'createdAt',
    'homeFastBreakPts', 'homePtsInPaint', 'homePtsOffTurnovers', 'homeSecondChancePts',
    'awayFastBreakPts', 'awayPtsInPaint', 'awayPtsOffTurnovers', 'awaySecondChancePts',
    'arena', 'attendance', 'seriesId',
}

# Advanced fields (fetch_advanced enrichment), `started` (starters step) and dnpReason are
# deliberately absent: new rows get the DB defaults (NULL / false) and existing values are
# never overwritten by a refresh.
PLAYER_LOG_COLUMNS = [
    'id', 'playerId', 'teamId', 'gameId', 'season', 'seasonId',
    'gameDate', 'homeAway', 'result',
    'minutes', 'minutesStr',
    'points', 'fieldGoals', 'fieldGoalAtt', 'fieldGoalPct',
    'threePointers', 'threePointAtt', 'threePointPct',
    'freeThrows', 'freeThrowAtt', 'freeThrowPct',
    'reboundsOff', 'reboundsDef', 'reboundsTotal',
    'assists', 'steals', 'blocks', 'turnovers', 'personalFouls',
    'plusMinus', 'trueShootingPct', 'effectiveFgPct', 'dnp',
    'createdAt', 'updatedAt',
]


def _team_side_stats(row):
    """LeagueGameLog (T) row -> GameBoxScore per-side stats (keys without home/away prefix)."""
    return {
        'Points': safe_int(row.get('PTS'), 0),
        'FieldGoals': safe_int(row.get('FGM'), 0),
        'FieldGoalAtt': safe_int(row.get('FGA'), 0),
        'FieldGoalPct': pct_to_decimal(row.get('FG_PCT')),
        'ThreePointers': safe_int(row.get('FG3M'), 0),
        'ThreePointAtt': safe_int(row.get('FG3A'), 0),
        'ThreePointPct': pct_to_decimal(row.get('FG3_PCT')),
        'FreeThrows': safe_int(row.get('FTM'), 0),
        'FreeThrowAtt': safe_int(row.get('FTA'), 0),
        'FreeThrowPct': pct_to_decimal(row.get('FT_PCT')),
        'ReboundsOff': safe_int(row.get('OREB')),
        'ReboundsDef': safe_int(row.get('DREB')),
        'ReboundsTotal': safe_int(row.get('REB'), 0),
        'Assists': safe_int(row.get('AST'), 0),
        'Steals': safe_int(row.get('STL'), 0),
        'Blocks': safe_int(row.get('BLK'), 0),
        'Turnovers': safe_int(row.get('TOV'), 0),
        'PersonalFouls': safe_int(row.get('PF')),
        'FastBreakPts': None,
        'PtsInPaint': None,
        'PtsOffTurnovers': None,
        'SecondChancePts': None,
    }


def _is_home(matchup):
    return ' vs. ' in str(matchup)


def _is_away(matchup):
    return ' @ ' in str(matchup)


def transform_team_game_log(df, season, known_team_ids=None):
    """
    Pair the two LeagueGameLog (T) rows of each GAME_ID into one GameBoxScore row.
    Home row: MATCHUP 'LAL vs. BOS'; away row: 'BOS @ LAL'. Games missing either side
    (or with a team not in known_team_ids, when given) are skipped.
    """
    if df is None or df.empty:
        return []

    known = {str(t) for t in known_team_ids} if known_team_ids is not None else None
    sides = {}  # gameId -> {'home': row, 'away': row}
    for _, row in df.iterrows():
        game_id = normalize_game_id(row.get('GAME_ID'))
        if not game_id:
            continue
        matchup = row.get('MATCHUP', '')
        if _is_home(matchup):
            sides.setdefault(game_id, {})['home'] = row
        elif _is_away(matchup):
            sides.setdefault(game_id, {})['away'] = row

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    box_rows = []
    for game_id, pair in sides.items():
        home, away = pair.get('home'), pair.get('away')
        if home is None or away is None:
            continue
        home_tid, away_tid = safe_int(home.get('TEAM_ID')), safe_int(away.get('TEAM_ID'))
        if home_tid is None or away_tid is None:
            continue
        home_id, away_id = str(home_tid), str(away_tid)
        if known is not None and (home_id not in known or away_id not in known):
            continue
        game_date = parse_date(home.get('GAME_DATE')) or parse_date(away.get('GAME_DATE'))
        if game_date is None:
            continue

        row = {
            'id': generate_cuid(),
            'gameId': game_id,
            'gameDate': game_date,
            'season': season,
            'seasonId': season,
            'homeTeamId': home_id,
            'awayTeamId': away_id,
            'arena': None,
            'attendance': None,
            'isPlayoff': game_id.startswith(PLAYOFF_PREFIX),
            'seriesId': None,
            'createdAt': now,
            'updatedAt': now,
        }
        for prefix, side in (('home', home), ('away', away)):
            for key, val in _team_side_stats(side).items():
                row[f'{prefix}{key}'] = val
        box_rows.append(row)

    return box_rows


def transform_player_game_log(df, season, known_player_ids, game_ids):
    """
    Map LeagueGameLog (P) rows to PlayerGameLog rows, keeping only players in
    known_player_ids and games in game_ids (FK safety).
    """
    if df is None or df.empty:
        return []

    known_players = {str(p) for p in known_player_ids}
    known_games = {str(g) for g in game_ids}
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = []

    for _, row in df.iterrows():
        player_id = str(safe_int(row.get('PLAYER_ID')))
        game_id = normalize_game_id(row.get('GAME_ID'))
        team_id = safe_int(row.get('TEAM_ID'))
        if player_id not in known_players or game_id not in known_games or team_id is None:
            continue

        game_date = parse_date(row.get('GAME_DATE'))
        if game_date is None:
            continue
        wl = str(row.get('WL', '')).strip().upper()
        min_decimal, min_str = parse_minutes(row.get('MIN'))

        log_row = {
            'id': generate_cuid(),
            'playerId': player_id,
            'teamId': str(team_id),
            'gameId': game_id,
            'season': season,
            'seasonId': season,
            'gameDate': game_date,
            'homeAway': 'HOME' if _is_home(row.get('MATCHUP', '')) else 'AWAY',
            'result': wl if wl in ('W', 'L') else 'L',
            'minutes': min_decimal,
            'minutesStr': min_str,
            'points': safe_int(row.get('PTS'), 0),
            'fieldGoals': safe_int(row.get('FGM'), 0),
            'fieldGoalAtt': safe_int(row.get('FGA'), 0),
            'fieldGoalPct': pct_to_decimal(row.get('FG_PCT')),
            'threePointers': safe_int(row.get('FG3M'), 0),
            'threePointAtt': safe_int(row.get('FG3A'), 0),
            'threePointPct': pct_to_decimal(row.get('FG3_PCT')),
            'freeThrows': safe_int(row.get('FTM'), 0),
            'freeThrowAtt': safe_int(row.get('FTA'), 0),
            'freeThrowPct': pct_to_decimal(row.get('FT_PCT')),
            'reboundsOff': safe_int(row.get('OREB'), 0),
            'reboundsDef': safe_int(row.get('DREB'), 0),
            'reboundsTotal': safe_int(row.get('REB'), 0),
            'assists': safe_int(row.get('AST'), 0),
            'steals': safe_int(row.get('STL'), 0),
            'blocks': safe_int(row.get('BLK'), 0),
            'turnovers': safe_int(row.get('TOV'), 0),
            'personalFouls': safe_int(row.get('PF'), 0),
            'plusMinus': safe_float(row.get('PLUS_MINUS')),
            'trueShootingPct': None,
            'effectiveFgPct': None,
            'dnp': min_decimal is None or min_decimal == 0,
            'createdAt': now,
            'updatedAt': now,
        }

        fga, fta = log_row['fieldGoalAtt'], log_row['freeThrowAtt']
        tsa = fga + 0.44 * fta
        if tsa > 0:
            log_row['trueShootingPct'] = round(log_row['points'] / (2 * tsa), 4)
        if fga > 0:
            log_row['effectiveFgPct'] = round((log_row['fieldGoals'] + 0.5 * log_row['threePointers']) / fga, 4)

        rows.append(log_row)

    return rows


def extract_starter_ids(player_stats_df, team_id=None):
    """
    Starter player IDs from a BoxScoreTraditionalV3 PlayerStats DataFrame.
    Starters have a non-empty `position` (F/C/G); bench players have ''.
    """
    if player_stats_df is None or player_stats_df.empty:
        return set()
    if 'personId' not in player_stats_df.columns or 'position' not in player_stats_df.columns:
        return set()

    starters = set()
    for _, row in player_stats_df.iterrows():
        if team_id is not None and str(safe_int(row.get('teamId'))) != str(team_id):
            continue
        pos = row.get('position')
        if pos is None or (isinstance(pos, float) and pos != pos):
            continue
        if str(pos).strip() in ('', 'nan', 'None'):
            continue
        pid = safe_int(row.get('personId'))
        if pid is not None:
            starters.add(str(pid))
    return starters


def _league_game_log(season, player_or_team):
    dfs = safe_call(
        LeagueGameLog,
        season=season,
        player_or_team_abbreviation=player_or_team,
        season_type_all_star='Regular Season',
    )
    return dfs[0] if dfs else None


def fetch_league_team_logs(season=None):
    """One LeagueGameLog (T) call -> GameBoxScore for every game in the season. Returns row count."""
    if season is None:
        season = CURRENT_SEASON_YEAR
    print(f"[LEAGUE TEAM LOGS] Fetching LeagueGameLog (T) for {season}...")

    df = _league_game_log(season, 'T')
    with get_db() as session:
        known_team_ids = {r[0] for r in session.execute(text('SELECT "id" FROM "Team"'))}

    rows = transform_team_game_log(df, season, known_team_ids)
    print(f"  {len(rows)} games paired from {0 if df is None else len(df)} team rows")

    with get_db() as session:
        count = upsert_rows(
            session, 'GameBoxScore', rows, GAME_BOX_COLUMNS,
            ['gameId'],
            exclude_from_update=GAME_BOX_PRESERVE,
        )
        session.commit()
        print(f"  [OK] Upserted {count} GameBoxScore records")
    return count


def fetch_league_player_logs(season=None):
    """One LeagueGameLog (P) call -> PlayerGameLog for every known player. Returns row count."""
    if season is None:
        season = CURRENT_SEASON_YEAR
    print(f"[LEAGUE PLAYER LOGS] Fetching LeagueGameLog (P) for {season}...")

    df = _league_game_log(season, 'P')
    with get_db() as session:
        known_player_ids = {r[0] for r in session.execute(text('SELECT "id" FROM "Player"'))}
        game_ids = {r[0] for r in session.execute(
            text('SELECT "gameId" FROM "GameBoxScore" WHERE "season" = :s'), {'s': season}
        )}

    rows = transform_player_game_log(df, season, known_player_ids, game_ids)
    total_in = 0 if df is None else len(df)
    if total_in - len(rows) > 0:
        print(f"  [INFO] Skipped {total_in - len(rows)} rows (player not in Player table or game not in GameBoxScore)")

    chunk_size = 500
    total = 0
    with get_db() as session:
        for i in range(0, len(rows), chunk_size):
            total += upsert_rows(
                session, 'PlayerGameLog', rows[i:i + chunk_size], PLAYER_LOG_COLUMNS,
                ['playerId', 'gameId', 'teamId'],
                exclude_from_update={'id', 'createdAt'},
            )
            session.commit()
        print(f"  [OK] Upserted {total} PlayerGameLog records")
    return total


def fetch_focus_team_starters(season=None, team_id=LAKERS_TEAM_ID):
    """
    For the focus team's games with fewer than 5 starters flagged (none yet, or a partial
    earlier run), call
    BoxScoreTraditionalV3 once per game and set started=true for both teams' starters.
    Returns the number of PlayerGameLog rows flagged.
    """
    if season is None:
        season = CURRENT_SEASON_YEAR
    team_id = str(team_id)
    print(f"[STARTERS] Flagging starters for team {team_id} games in {season}...")

    with get_db() as session:
        game_ids = [r[0] for r in session.execute(text('''
            SELECT g."gameId" FROM "GameBoxScore" g
            WHERE g."season" = :season
              AND (g."homeTeamId" = :tid OR g."awayTeamId" = :tid)
              AND EXISTS (SELECT 1 FROM "PlayerGameLog" p
                          WHERE p."gameId" = g."gameId" AND p."teamId" = :tid)
              AND (SELECT COUNT(*) FROM "PlayerGameLog" p
                   WHERE p."gameId" = g."gameId" AND p."teamId" = :tid AND p."started" = true) < 5
            ORDER BY g."gameDate"
        '''), {'season': season, 'tid': team_id})]

    print(f"  {len(game_ids)} game(s) need starters")
    flagged = 0
    failures = []
    for game_id in game_ids:
        try:
            dfs = safe_call(BoxScoreTraditionalV3, game_id=game_id)
        except Exception as e:  # one bad box score shouldn't stop the rest; retried next run
            print(f"    [WARN] Game {game_id}: box score unavailable ({e})")
            failures.append(game_id)
            continue
        player_df = next((d for d in (dfs or []) if 'personId' in d.columns and 'position' in d.columns), None)
        starters = extract_starter_ids(player_df)
        focus_starters = extract_starter_ids(player_df, team_id)
        if len(focus_starters) != 5:
            print(f"    [WARN] Game {game_id}: found {len(focus_starters)} starters for team {team_id}")
        if not starters:
            continue
        with get_db() as session:
            result = session.execute(text('''
                UPDATE "PlayerGameLog" SET "started" = true, "updatedAt" = NOW()
                WHERE "gameId" = :gid AND "playerId" = ANY(:pids) AND "started" = false
            '''), {'gid': game_id, 'pids': sorted(starters)})
            flagged += result.rowcount or 0

    print(f"  [OK] Flagged {flagged} starter rows ({len(failures)} game(s) failed, retried next run)")
    if game_ids and len(failures) == len(game_ids):
        raise RuntimeError(f"All {len(failures)} box score calls failed")
    return flagged


if __name__ == '__main__':
    fetch_league_team_logs()
    fetch_league_player_logs()
    fetch_focus_team_starters()
