"""
Fetch player metadata and career/season stats.
Populates: Player (updates), PlayerSeasonStats tables.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime

from nba_api.stats.endpoints import (
    PlayerCareerStats,
    LeagueDashPlayerStats,
    CommonPlayerInfo,
)
from nba_api.stats.static import teams as nba_teams

from config import (
    CURRENT_SEASON_YEAR, BACKFILL_SEASONS, LAKERS_TEAM_ID,
)
from utils import (
    get_db, safe_call, generate_cuid, safe_int, safe_float,
    pct_to_decimal, upsert_rows, execute_sql,
)

from sqlalchemy import text


def get_team_player_ids(session, team_id=None):
    """Get player IDs from the Player table, optionally filtered by team."""
    if team_id:
        result = session.execute(
            text('SELECT "id" FROM "Player" WHERE "teamId" = :tid'),
            {'tid': str(team_id)}
        )
    else:
        result = session.execute(
            text('SELECT "id" FROM "Player" WHERE "isActive" = true')
        )
    return [row[0] for row in result.fetchall()]


def fetch_player_details(player_ids):
    """
    Fetch detailed player info (draft, country, school) via CommonPlayerInfo.
    Updates the Player table with additional metadata.
    """
    print(f"[PLAYER DETAILS] Fetching details for {len(player_ids)} players...")

    updates = []
    for i, pid in enumerate(player_ids):
        if (i + 1) % 25 == 0:
            print(f"  Progress: {i+1}/{len(player_ids)}")
        try:
            dfs = safe_call(CommonPlayerInfo, player_id=pid)
            if not dfs or len(dfs) == 0 or dfs[0].empty:
                continue
            info = dfs[0].iloc[0]

            birth_date = None
            bd = info.get('BIRTHDATE')
            if bd and str(bd).strip():
                try:
                    birth_date = datetime.strptime(str(bd).strip()[:10], '%Y-%m-%d')
                except ValueError:
                    pass

            row = {
                'id': str(pid),
                'firstName': str(info.get('FIRST_NAME', '')),
                'lastName': str(info.get('LAST_NAME', '')),
                'fullName': str(info.get('DISPLAY_FIRST_LAST', '')),
                'birthDate': birth_date,
                'height': str(info.get('HEIGHT', '')) or None,
                'weight': safe_int(info.get('WEIGHT')),
                'position': str(info.get('POSITION', '')) or None,
                'jersey': str(info.get('JERSEY', '')) or None,
                'isActive': str(info.get('ROSTERSTATUS', '')) == 'Active',
                'fromYear': safe_int(info.get('FROM_YEAR')),
                'toYear': safe_int(info.get('TO_YEAR')),
                'draftYear': safe_int(info.get('DRAFT_YEAR')),
                'draftRound': safe_int(info.get('DRAFT_ROUND')),
                'draftPick': safe_int(info.get('DRAFT_NUMBER')),
                'country': str(info.get('COUNTRY', '')) or None,
                'school': str(info.get('SCHOOL', '')) or None,
                'headshotUrl': f"https://cdn.nba.com/headshots/nba/latest/1040x760/{pid}.png",
                'teamId': str(info.get('TEAM_ID', '')) or None,
                'createdAt': datetime.utcnow(),
                'updatedAt': datetime.utcnow(),
            }

            # Don't set teamId to '0' or empty
            if row['teamId'] in ('0', '', 'None', 'nan'):
                row['teamId'] = None

            updates.append(row)

        except Exception as e:
            print(f"  [WARN] Could not fetch details for player {pid}: {e}")
            continue

    if updates:
        columns = [
            'id', 'firstName', 'lastName', 'fullName', 'birthDate',
            'height', 'weight', 'position', 'jersey', 'isActive',
            'fromYear', 'toYear', 'draftYear', 'draftRound', 'draftPick',
            'country', 'school', 'headshotUrl', 'teamId',
            'createdAt', 'updatedAt',
        ]
        with get_db() as session:
            count = upsert_rows(session, 'Player', updates, columns, ['id'])
            session.commit()
            print(f"  [OK] Updated {count} player detail records")

    return updates


PLAYER_SEASON_COLUMNS = [
    'id', 'playerId', 'teamId', 'season', 'seasonId',
    'gamesPlayed', 'gamesStarted', 'minutesPerGame',
    'pointsPerGame', 'fieldGoalsPerGame', 'fieldGoalAttPerGame', 'fieldGoalPct',
    'threePointersPerGame', 'threePointAttPerGame', 'threePointPct',
    'freeThrowsPerGame', 'freeThrowAttPerGame', 'freeThrowPct',
    'reboundsOffPerGame', 'reboundsDefPerGame', 'reboundsPerGame',
    'assistsPerGame', 'stealsPerGame', 'blocksPerGame',
    'turnoversPerGame', 'foulsPerGame', 'plusMinusPerGame',
    'totalPoints', 'totalRebounds', 'totalAssists',
    'totalSteals', 'totalBlocks', 'totalTurnovers',
    'trueShootingPct', 'effectiveFgPct', 'usageRate',
    'assistPct', 'reboundPct', 'offRating', 'defRating', 'netRating',
    'per', 'winShares', 'boxPlusMinus', 'vorp',
    'createdAt', 'updatedAt',
]


def transform_player_season_stats(base_df, adv_df, season, known_player_ids=None, known_team_ids=None):
    """
    Map league-wide LeagueDashPlayerStats (PerGame) Base + Advanced DataFrames to
    PlayerSeasonStats rows. Rows whose player/team is not in known_player_ids /
    known_team_ids (when given) are dropped for FK safety.
    """
    if base_df is None or base_df.empty:
        return []

    known_players = {str(p) for p in known_player_ids} if known_player_ids is not None else None
    known_teams = {str(t) for t in known_team_ids} if known_team_ids is not None else None

    adv_lookup = {}
    if adv_df is not None and not adv_df.empty:
        for _, arow in adv_df.iterrows():
            key = (str(safe_int(arow.get('PLAYER_ID'))), str(safe_int(arow.get('TEAM_ID'))))
            adv_lookup[key] = arow

    rows = []
    for _, row in base_df.iterrows():
        pid, tid = safe_int(row.get('PLAYER_ID')), safe_int(row.get('TEAM_ID'))
        if pid is None or tid is None:
            continue
        player_id, row_team_id = str(pid), str(tid)
        if known_players is not None and player_id not in known_players:
            continue
        if known_teams is not None and row_team_id not in known_teams:
            continue

        season_row = {
            'id': generate_cuid(),
            'playerId': player_id,
            'teamId': row_team_id,
            'season': season,
            'seasonId': season,
            'gamesPlayed': safe_int(row.get('GP'), 0),
            # LeagueDashPlayerStats has no GS column, so this is always 0; the API derives games
            # started from PlayerGameLog.started instead (gamesStartedByPlayer).
            'gamesStarted': safe_int(row.get('GS'), 0),
            'minutesPerGame': safe_float(row.get('MIN')),
            'pointsPerGame': safe_float(row.get('PTS')),
            'fieldGoalsPerGame': safe_float(row.get('FGM')),
            'fieldGoalAttPerGame': safe_float(row.get('FGA')),
            'fieldGoalPct': pct_to_decimal(row.get('FG_PCT')),
            'threePointersPerGame': safe_float(row.get('FG3M')),
            'threePointAttPerGame': safe_float(row.get('FG3A')),
            'threePointPct': pct_to_decimal(row.get('FG3_PCT')),
            'freeThrowsPerGame': safe_float(row.get('FTM')),
            'freeThrowAttPerGame': safe_float(row.get('FTA')),
            'freeThrowPct': pct_to_decimal(row.get('FT_PCT')),
            'reboundsOffPerGame': safe_float(row.get('OREB')),
            'reboundsDefPerGame': safe_float(row.get('DREB')),
            'reboundsPerGame': safe_float(row.get('REB')),
            'assistsPerGame': safe_float(row.get('AST')),
            'stealsPerGame': safe_float(row.get('STL')),
            'blocksPerGame': safe_float(row.get('BLK')),
            'turnoversPerGame': safe_float(row.get('TOV')),
            'foulsPerGame': safe_float(row.get('PF')),
            'plusMinusPerGame': safe_float(row.get('PLUS_MINUS')),
            # Totals: PerGame * GP
            'totalPoints': None,
            'totalRebounds': None,
            'totalAssists': None,
            'totalSteals': None,
            'totalBlocks': None,
            'totalTurnovers': None,
            # Advanced (merged below)
            'trueShootingPct': None,
            'effectiveFgPct': None,
            'usageRate': None,
            'assistPct': None,
            'reboundPct': None,
            'offRating': None,
            'defRating': None,
            'netRating': None,
            'per': None,
            'winShares': None,
            'boxPlusMinus': None,
            'vorp': None,
            'createdAt': datetime.utcnow(),
            'updatedAt': datetime.utcnow(),
        }

        # Calculate totals from per-game * GP
        gp = season_row['gamesPlayed'] or 0
        if gp > 0:
            season_row['totalPoints'] = safe_int((safe_float(row.get('PTS')) or 0) * gp)
            season_row['totalRebounds'] = safe_int((safe_float(row.get('REB')) or 0) * gp)
            season_row['totalAssists'] = safe_int((safe_float(row.get('AST')) or 0) * gp)
            season_row['totalSteals'] = safe_int((safe_float(row.get('STL')) or 0) * gp)
            season_row['totalBlocks'] = safe_int((safe_float(row.get('BLK')) or 0) * gp)
            season_row['totalTurnovers'] = safe_int((safe_float(row.get('TOV')) or 0) * gp)

        arow = adv_lookup.get((player_id, row_team_id))
        if arow is not None:
            season_row['trueShootingPct'] = pct_to_decimal(arow.get('TS_PCT'))
            season_row['effectiveFgPct'] = pct_to_decimal(arow.get('EFG_PCT'))
            season_row['usageRate'] = pct_to_decimal(arow.get('USG_PCT'))
            season_row['assistPct'] = pct_to_decimal(arow.get('AST_PCT'))
            season_row['reboundPct'] = pct_to_decimal(arow.get('REB_PCT'))
            season_row['offRating'] = safe_float(arow.get('OFF_RATING'))
            season_row['defRating'] = safe_float(arow.get('DEF_RATING'))
            season_row['netRating'] = safe_float(arow.get('NET_RATING'))
            # NOTE: this column holds NBA.com PIE (Player Impact Estimate, a 0-1 share),
            # NOT Hollinger PER. The schema name is legacy; never label it "PER" in the UI.
            season_row['per'] = safe_float(arow.get('PIE'))

        rows.append(season_row)

    return rows


def fetch_player_season_stats(seasons=None, team_id=None):
    """
    Fetch per-season averages for ALL players league-wide using LeagueDashPlayerStats
    (Base + Advanced), so a newcomer's previous-season row with his old team is kept.
    Rows are filtered to players in the Player table and teams in the Team table.
    Populates the PlayerSeasonStats table.

    team_id is accepted for backwards compatibility but ignored: filtering by team would
    drop other teams' rows for the players we track.
    """
    if seasons is None:
        seasons = BACKFILL_SEASONS
    if team_id:
        print(f"  [INFO] team_id={team_id} ignored; PlayerSeasonStats is always fetched league-wide")

    print(f"[PLAYER SEASON STATS] Fetching for {len(seasons)} season(s)...")

    with get_db() as session:
        known_player_ids = {r[0] for r in session.execute(text('SELECT "id" FROM "Player"'))}
        known_team_ids = {r[0] for r in session.execute(text('SELECT "id" FROM "Team"'))}

    all_rows = []
    for season in seasons:
        print(f"  Fetching season {season}...")
        try:
            base_dfs = safe_call(
                LeagueDashPlayerStats,
                season=season,
                per_mode_detailed='PerGame',
                measure_type_detailed_defense='Base',
                season_type_all_star='Regular Season',
            )
            if not base_dfs or base_dfs[0].empty:
                print(f"    No data for season {season}")
                continue
        except Exception as e:
            print(f"  [ERROR] Failed to fetch player stats for season {season}: {e}")
            continue

        adv_df = None
        try:
            adv_dfs = safe_call(
                LeagueDashPlayerStats,
                season=season,
                per_mode_detailed='PerGame',
                measure_type_detailed_defense='Advanced',
                season_type_all_star='Regular Season',
            )
            if adv_dfs and not adv_dfs[0].empty:
                adv_df = adv_dfs[0]
        except Exception as e:
            print(f"  [WARN] Could not fetch advanced stats for season {season}: {e}")

        rows = transform_player_season_stats(
            base_dfs[0], adv_df, season, known_player_ids, known_team_ids,
        )
        print(f"    {len(rows)} of {len(base_dfs[0])} player-season records match Player/Team tables")
        all_rows.extend(rows)

    # Upsert all rows
    if all_rows:
        with get_db() as session:
            count = upsert_rows(
                session, 'PlayerSeasonStats', all_rows, PLAYER_SEASON_COLUMNS,
                ['playerId', 'teamId', 'season'],
                exclude_from_update={'id', 'createdAt'},
            )
            session.commit()
            print(f"  [OK] Upserted {count} PlayerSeasonStats records")

    return all_rows


def run(seasons=None, team_id=None, fetch_details=True):
    """Run the full player data fetch."""
    if fetch_details:
        with get_db() as session:
            player_ids = get_team_player_ids(session, team_id)
        if player_ids:
            fetch_player_details(player_ids)

    stats = fetch_player_season_stats(seasons, team_id)
    print(f"[PLAYERS] Complete: {len(stats)} season stat records")
    return stats


if __name__ == '__main__':
    run()
