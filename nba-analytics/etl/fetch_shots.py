"""
Fetch shot chart detail data.
Populates: ShotChart table.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime

from nba_api.stats.endpoints import ShotChartDetail
from nba_api.stats.static import teams as nba_teams

from config import (
    CURRENT_SEASON_YEAR, BACKFILL_SEASONS, LAKERS_TEAM_ID,
)
from utils import (
    get_db, safe_call, generate_cuid, safe_int, safe_float,
    upsert_rows,
)

from sqlalchemy import text


def map_shot_type(shot_type_str):
    """Map nba_api shot type to our ShotType enum."""
    if shot_type_str and '3' in str(shot_type_str):
        return 'THREE_POINTER'
    return 'TWO_POINTER'


def map_shot_result(result_str):
    """Map nba_api shot result ('Made Shot' / 'Missed Shot') to our ShotResult enum."""
    if result_str and 'Made' in str(result_str):
        return 'MADE'
    return 'MISSED'


def fetch_shot_charts(seasons=None, team_ids=None):
    """
    Fetch shot chart data for all players on specified teams.
    Uses ShotChartDetail endpoint which returns all shots for a team in a season.
    Populates the ShotChart table.
    """
    if seasons is None:
        seasons = BACKFILL_SEASONS
    if team_ids is None:
        all_teams = nba_teams.get_teams()
        team_ids = [str(t['id']) for t in all_teams]

    print(f"[SHOTS] Fetching shot charts for {len(team_ids)} teams, {len(seasons)} season(s)...")

    total_shots = 0
    for season in seasons:
        print(f"  Season {season}...")
        for idx, team_id in enumerate(team_ids):
            try:
                # Fetch all shots for the team in this season (player_id=0 means all players)
                dfs = safe_call(
                    ShotChartDetail,
                    team_id=int(team_id),
                    player_id=0,
                    season_nullable=season,
                    context_measure_simple='FGA',
                    season_type_all_star='Regular Season',
                )
                if not dfs or len(dfs) == 0 or dfs[0].empty:
                    continue

                shots_df = dfs[0]
                print(f"    Team {team_id}: {len(shots_df)} shots")

                all_rows = []
                for _, row in shots_df.iterrows():
                    player_id = str(row.get('PLAYER_ID', ''))
                    game_id = str(row.get('GAME_ID', ''))
                    if not player_id or not game_id:
                        continue

                    shot_type_raw = str(row.get('SHOT_TYPE', ''))
                    event_type = str(row.get('EVENT_TYPE', ''))

                    shot_row = {
                        'id': generate_cuid(),
                        'playerId': player_id,
                        'teamId': str(team_id),
                        'gameId': game_id,
                        'season': season,
                        'seasonId': season,
                        'locX': safe_float(row.get('LOC_X'), 0.0),
                        'locY': safe_float(row.get('LOC_Y'), 0.0),
                        'shotZone': str(row.get('SHOT_ZONE_BASIC', '')) or None,
                        'shotZoneArea': str(row.get('SHOT_ZONE_AREA', '')) or None,
                        'shotZoneRange': str(row.get('SHOT_ZONE_RANGE', '')) or None,
                        'shotDistance': safe_int(row.get('SHOT_DISTANCE')),
                        'shotType': map_shot_type(shot_type_raw),
                        'shotResult': map_shot_result(event_type),
                        'actionType': str(row.get('ACTION_TYPE', '')) or None,
                        'period': safe_int(row.get('PERIOD')),
                        'gameClock': str(row.get('MINUTES_REMAINING', '')) + ':' + str(row.get('SECONDS_REMAINING', '')).zfill(2) if row.get('MINUTES_REMAINING') is not None else None,
                        'shotValue': 3 if 'THREE_POINTER' == map_shot_type(shot_type_raw) else 2,
                        'createdAt': datetime.utcnow(),
                        'updatedAt': datetime.utcnow(),
                    }
                    all_rows.append(shot_row)

                # Upsert in chunks
                if all_rows:
                    columns = [
                        'id', 'playerId', 'teamId', 'gameId', 'season', 'seasonId',
                        'locX', 'locY',
                        'shotZone', 'shotZoneArea', 'shotZoneRange', 'shotDistance',
                        'shotType', 'shotResult', 'actionType',
                        'period', 'gameClock', 'shotValue',
                        'createdAt', 'updatedAt',
                    ]

                    # ShotChart has no unique constraint for upsert, so we use a different strategy:
                    # Delete existing shots for this team/season/game and re-insert.
                    # This is idempotent since we replace the full set each time.
                    with get_db() as session:
                        # Filter out shots referencing games not in GameBoxScore (FK constraint)
                        result = session.execute(text('SELECT "gameId" FROM "GameBoxScore"'))
                        known_game_ids = {row[0] for row in result}
                        before_count = len(all_rows)
                        all_rows = [r for r in all_rows if r['gameId'] in known_game_ids]
                        skipped = before_count - len(all_rows)
                        if skipped > 0:
                            print(f"      Skipped {skipped} shots (game not in GameBoxScore)")

                        # Get unique game_ids in this batch
                        game_ids_in_batch = list(set(r['gameId'] for r in all_rows))
                        for gid in game_ids_in_batch:
                            session.execute(
                                text("""
                                    DELETE FROM "ShotChart"
                                    WHERE "teamId" = :tid AND "season" = :season AND "gameId" = :gid
                                """),
                                {'tid': str(team_id), 'season': season, 'gid': gid}
                            )

                        # Insert all shots
                        insert_cols = ', '.join(f'"{c}"' for c in columns)
                        insert_placeholders = ', '.join(f':{c}' for c in columns)
                        insert_sql = f'INSERT INTO "ShotChart" ({insert_cols}) VALUES ({insert_placeholders})'

                        for shot in all_rows:
                            params = {c: shot.get(c) for c in columns}
                            session.execute(text(insert_sql), params)

                        session.commit()
                        total_shots += len(all_rows)

                if (idx + 1) % 10 == 0:
                    print(f"    Progress: {idx+1}/{len(team_ids)} teams")

            except Exception as e:
                print(f"    [ERROR] Team {team_id} season {season}: {e}")
                continue

    print(f"  [OK] Inserted {total_shots} total shot records")
    return total_shots


def run(seasons=None, team_ids=None):
    """Run the full shot chart fetch."""
    count = fetch_shot_charts(seasons, team_ids)
    print(f"[SHOTS] Complete: {count} shots")
    return count


if __name__ == '__main__':
    run()
