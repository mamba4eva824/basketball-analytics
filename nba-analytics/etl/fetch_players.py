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


def fetch_player_season_stats(seasons=None, team_id=None):
    """
    Fetch per-season averages for all players (or a specific team) using LeagueDashPlayerStats.
    Populates the PlayerSeasonStats table.
    """
    if seasons is None:
        seasons = BACKFILL_SEASONS

    print(f"[PLAYER SEASON STATS] Fetching for {len(seasons)} season(s)...")

    all_rows = []
    for season in seasons:
        print(f"  Fetching season {season}...")
        try:
            kwargs = {
                'season': season,
                'per_mode_detailed': 'PerGame',
                'measure_type_detailed_defense': 'Base',
                'season_type_all_star': 'Regular Season',
            }
            dfs = safe_call(LeagueDashPlayerStats, **kwargs)
            if not dfs or len(dfs) == 0 or dfs[0].empty:
                print(f"    No data for season {season}")
                continue

            stats_df = dfs[0]

            # If team_id is specified, filter
            if team_id:
                stats_df = stats_df[stats_df['TEAM_ID'] == int(team_id)]

            print(f"    Found {len(stats_df)} player-season records")

            for _, row in stats_df.iterrows():
                player_id = str(row.get('PLAYER_ID', ''))
                row_team_id = str(row.get('TEAM_ID', ''))
                if not player_id or not row_team_id:
                    continue

                season_row = {
                    'id': generate_cuid(),
                    'playerId': player_id,
                    'teamId': row_team_id,
                    'season': season,
                    'seasonId': season,
                    'gamesPlayed': safe_int(row.get('GP'), 0),
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
                    # Advanced (will be updated separately)
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

                all_rows.append(season_row)

        except Exception as e:
            print(f"  [ERROR] Failed to fetch player stats for season {season}: {e}")
            continue

    # Now fetch advanced stats to fill in TS%, eFG%, USG%, etc.
    print("  Fetching advanced player stats...")
    for season in seasons:
        try:
            kwargs = {
                'season': season,
                'per_mode_detailed': 'PerGame',
                'measure_type_detailed_defense': 'Advanced',
                'season_type_all_star': 'Regular Season',
            }
            dfs = safe_call(LeagueDashPlayerStats, **kwargs)
            if not dfs or len(dfs) == 0 or dfs[0].empty:
                continue

            adv_df = dfs[0]
            if team_id:
                adv_df = adv_df[adv_df['TEAM_ID'] == int(team_id)]

            # Build lookup: (player_id, team_id) -> advanced stats
            adv_lookup = {}
            for _, arow in adv_df.iterrows():
                key = (str(arow.get('PLAYER_ID', '')), str(arow.get('TEAM_ID', '')))
                adv_lookup[key] = arow

            # Merge advanced into existing rows
            for sr in all_rows:
                if sr['season'] != season:
                    continue
                key = (sr['playerId'], sr['teamId'])
                if key in adv_lookup:
                    arow = adv_lookup[key]
                    sr['trueShootingPct'] = pct_to_decimal(arow.get('TS_PCT'))
                    sr['effectiveFgPct'] = pct_to_decimal(arow.get('EFG_PCT'))
                    sr['usageRate'] = pct_to_decimal(arow.get('USG_PCT'))
                    sr['assistPct'] = pct_to_decimal(arow.get('AST_PCT'))
                    sr['reboundPct'] = pct_to_decimal(arow.get('REB_PCT'))
                    sr['offRating'] = safe_float(arow.get('OFF_RATING'))
                    sr['defRating'] = safe_float(arow.get('DEF_RATING'))
                    sr['netRating'] = safe_float(arow.get('NET_RATING'))
                    sr['per'] = safe_float(arow.get('PIE'))  # PIE is closest to PER available
                    sr['winShares'] = None  # Not available from this endpoint
                    sr['boxPlusMinus'] = None
                    sr['vorp'] = None

            print(f"    Merged advanced stats for season {season}")

        except Exception as e:
            print(f"  [WARN] Could not fetch advanced stats for season {season}: {e}")
            continue

    # Upsert all rows
    if all_rows:
        columns = [
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
        with get_db() as session:
            count = upsert_rows(
                session, 'PlayerSeasonStats', all_rows, columns,
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
