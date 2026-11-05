"""
Fetch advanced stats, on/off data, and lineup data.
Populates: LineupStats table.
PlayerGameLog advanced per-game stats: enrich_player_game_logs_advanced delegates to
fetch_player_advanced (BoxScoreAdvancedV3).
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime

from nba_api.stats.endpoints import TeamDashLineups
from nba_api.stats.static import teams as nba_teams

from config import (
    CURRENT_SEASON_YEAR, BACKFILL_SEASONS, LAKERS_TEAM_ID,
)
from utils import (
    get_db, safe_call, generate_cuid, safe_int, safe_float,
    pct_to_decimal, upsert_rows,
)



def fetch_lineup_stats(seasons=None, team_ids=None):
    """
    Fetch lineup data using TeamDashLineups endpoint.
    Populates the LineupStats table.
    """
    if seasons is None:
        seasons = BACKFILL_SEASONS
    if team_ids is None:
        all_teams = nba_teams.get_teams()
        team_ids = [str(t['id']) for t in all_teams]

    print(f"[LINEUPS] Fetching lineup stats for {len(team_ids)} teams, {len(seasons)} season(s)...")

    all_rows = []
    for season in seasons:
        print(f"  Season {season}...")
        for idx, team_id in enumerate(team_ids):
            try:
                dfs = safe_call(
                    TeamDashLineups,
                    team_id=team_id,
                    season=season,
                    measure_type_detailed_defense='Advanced',
                    group_quantity=5,
                    season_type_all_star='Regular Season',
                    per_mode_detailed='Totals',
                )
                # Response has Overall + Lineups data sets; pick the one with GROUP_ID
                lineup_df = next((d for d in (dfs or []) if 'GROUP_ID' in d.columns), None)
                if lineup_df is None or lineup_df.empty:
                    continue

                for _, row in lineup_df.iterrows():
                    group_set = str(row.get('GROUP_SET', ''))
                    group_value = str(row.get('GROUP_VALUE', ''))

                    # Parse the lineup — GROUP_VALUE contains player names separated by ' - '
                    # We need the GROUP_ID for player IDs
                    group_id = str(row.get('GROUP_ID', ''))
                    if not group_id or group_id == 'nan':
                        continue

                    # group_id is dash-separated player IDs, e.g. "-203076-1628398-...-2544-"
                    player_ids = sorted(p for p in group_id.replace(' ', '').split('-') if p)
                    if len(player_ids) != 5:
                        continue

                    lineup_key = '-'.join(player_ids)

                    lineup_row = {
                        'id': generate_cuid(),
                        'teamId': str(team_id),
                        'season': season,
                        'seasonId': season,
                        'player1Id': player_ids[0],
                        'player2Id': player_ids[1],
                        'player3Id': player_ids[2],
                        'player4Id': player_ids[3],
                        'player5Id': player_ids[4],
                        'lineupKey': lineup_key,
                        'gamesPlayed': safe_int(row.get('GP'), 0),
                        'totalMinutes': safe_float(row.get('MIN'), 0.0),
                        'offRating': safe_float(row.get('OFF_RATING')),
                        'defRating': safe_float(row.get('DEF_RATING')),
                        'netRating': safe_float(row.get('NET_RATING')),
                        'pace': safe_float(row.get('PACE')),
                        'points': safe_int(row.get('PTS')),
                        'oppPoints': safe_int(row.get('OPP_PTS')),
                        'fieldGoals': safe_int(row.get('FGM')),
                        'fieldGoalAtt': safe_int(row.get('FGA')),
                        'fieldGoalPct': pct_to_decimal(row.get('FG_PCT')),
                        'threePointers': safe_int(row.get('FG3M')),
                        'threePointAtt': safe_int(row.get('FG3A')),
                        'threePointPct': pct_to_decimal(row.get('FG3_PCT')),
                        'freeThrows': safe_int(row.get('FTM')),
                        'freeThrowAtt': safe_int(row.get('FTA')),
                        'freeThrowPct': pct_to_decimal(row.get('FT_PCT')),
                        'rebounds': safe_int(row.get('REB')),
                        'assists': safe_int(row.get('AST')),
                        'steals': safe_int(row.get('STL')),
                        'blocks': safe_int(row.get('BLK')),
                        'turnovers': safe_int(row.get('TOV')),
                        'plusMinus': safe_float(row.get('PLUS_MINUS')),
                        'createdAt': datetime.utcnow(),
                        'updatedAt': datetime.utcnow(),
                    }
                    all_rows.append(lineup_row)

                if (idx + 1) % 10 == 0:
                    print(f"    Team {idx+1}/{len(team_ids)}")

            except Exception as e:
                print(f"    [WARN] Team {team_id} season {season} lineups: {e}")
                continue

    # Upsert into LineupStats
    if all_rows:
        columns = [
            'id', 'teamId', 'season', 'seasonId',
            'player1Id', 'player2Id', 'player3Id', 'player4Id', 'player5Id',
            'lineupKey', 'gamesPlayed', 'totalMinutes',
            'offRating', 'defRating', 'netRating', 'pace',
            'points', 'oppPoints',
            'fieldGoals', 'fieldGoalAtt', 'fieldGoalPct',
            'threePointers', 'threePointAtt', 'threePointPct',
            'freeThrows', 'freeThrowAtt', 'freeThrowPct',
            'rebounds', 'assists', 'steals', 'blocks', 'turnovers',
            'plusMinus',
            'createdAt', 'updatedAt',
        ]
        with get_db() as session:
            count = upsert_rows(
                session, 'LineupStats', all_rows, columns,
                ['teamId', 'season', 'lineupKey'],
                exclude_from_update={'id', 'createdAt'},
            )
            session.commit()
            print(f"  [OK] Upserted {count} LineupStats records")

    return all_rows


def enrich_player_game_logs_advanced(seasons=None, team_ids=None):
    """
    Per-game player advanced stats for these teams' games — delegates to the incremental
    BoxScoreAdvancedV3 step (fetch_player_advanced), the same one refresh.py runs. Kept so
    run_all.py / run_incremental.py keep working. (The old BoxScoreAdvancedV2 version refetched
    every game, overwrote `started` and stored PIE in `pir`, relabeling one stat as another.)
    """
    import fetch_player_advanced
    for season in seasons or [CURRENT_SEASON_YEAR]:
        for team_id in team_ids or [LAKERS_TEAM_ID]:
            fetch_player_advanced.fetch_focus_team_player_advanced(season, team_id)


def run(seasons=None, team_ids=None):
    """Run the full advanced stats fetch."""
    lineups = fetch_lineup_stats(seasons, team_ids)
    enrich_player_game_logs_advanced(seasons, team_ids)
    print(f"[ADVANCED] Complete: {len(lineups)} lineup records")
    return lineups


if __name__ == '__main__':
    run()
