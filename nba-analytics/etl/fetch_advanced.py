"""
Fetch advanced stats, on/off data, and lineup data.
Populates: LineupStats table.
Also enriches PlayerGameLog with advanced per-game stats via BoxScoreAdvancedV2.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime

from nba_api.stats.endpoints import (
    TeamPlayerOnOffDetails,
    BoxScoreAdvancedV2,
    TeamDashLineups,
)
from nba_api.stats.static import teams as nba_teams

from config import (
    CURRENT_SEASON_YEAR, BACKFILL_SEASONS, LAKERS_TEAM_ID,
)
from utils import (
    get_db, safe_call, generate_cuid, safe_int, safe_float,
    pct_to_decimal, upsert_rows,
)

from sqlalchemy import text


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
    Fetch BoxScoreAdvancedV2 for games and update PlayerGameLog with advanced stats.
    This enriches existing PlayerGameLog rows with offRating, defRating, netRating,
    assistPct, reboundPct, usageRate, pace, pir.
    """
    if seasons is None:
        seasons = [CURRENT_SEASON_YEAR]
    if team_ids is None:
        team_ids = [LAKERS_TEAM_ID]

    print(f"[ADVANCED BOX] Enriching PlayerGameLog with advanced box score stats...")

    # Get game IDs from existing GameBoxScore records
    with get_db() as session:
        for season in seasons:
            for team_id in team_ids:
                result = session.execute(
                    text("""
                        SELECT "gameId" FROM "GameBoxScore"
                        WHERE "season" = :season
                        AND ("homeTeamId" = :tid OR "awayTeamId" = :tid)
                        ORDER BY "gameDate" DESC
                        LIMIT 82
                    """),
                    {'season': season, 'tid': str(team_id)}
                )
                game_ids = [r[0] for r in result.fetchall()]

                print(f"  Found {len(game_ids)} games for team {team_id} in {season}")

                updated = 0
                for gidx, game_id in enumerate(game_ids):
                    try:
                        dfs = safe_call(
                            BoxScoreAdvancedV2,
                            game_id=game_id,
                        )
                        if not dfs or len(dfs) == 0 or dfs[0].empty:
                            continue

                        player_stats = dfs[0]
                        for _, prow in player_stats.iterrows():
                            pid = str(prow.get('PLAYER_ID', ''))
                            ptid = str(prow.get('TEAM_ID', ''))
                            if not pid:
                                continue

                            off_rtg = safe_float(prow.get('OFF_RATING'))
                            def_rtg = safe_float(prow.get('DEF_RATING'))
                            net_rtg = safe_float(prow.get('NET_RATING'))
                            ast_pct = pct_to_decimal(prow.get('AST_PCT'))
                            reb_pct = pct_to_decimal(prow.get('REB_PCT'))
                            usg = pct_to_decimal(prow.get('USG_PCT'))
                            pace_val = safe_float(prow.get('PACE'))
                            pir_val = safe_float(prow.get('PIE'))
                            ts_pct = pct_to_decimal(prow.get('TS_PCT'))
                            efg_pct = pct_to_decimal(prow.get('EFG_PCT'))

                            # Detect if player started (START_POSITION is not empty)
                            start_pos = str(prow.get('START_POSITION', ''))
                            started = bool(start_pos.strip())

                            session.execute(
                                text("""
                                    UPDATE "PlayerGameLog"
                                    SET "offRating" = :offRtg,
                                        "defRating" = :defRtg,
                                        "netRating" = :netRtg,
                                        "assistPct" = :astPct,
                                        "reboundPct" = :rebPct,
                                        "usageRate" = :usg,
                                        "pace" = :pace,
                                        "pir" = :pir,
                                        "trueShootingPct" = COALESCE(:tsPct, "trueShootingPct"),
                                        "effectiveFgPct" = COALESCE(:efgPct, "effectiveFgPct"),
                                        "started" = :started,
                                        "updatedAt" = NOW()
                                    WHERE "playerId" = :pid
                                      AND "gameId" = :gid
                                      AND "teamId" = :tid
                                """),
                                {
                                    'offRtg': off_rtg, 'defRtg': def_rtg, 'netRtg': net_rtg,
                                    'astPct': ast_pct, 'rebPct': reb_pct, 'usg': usg,
                                    'pace': pace_val, 'pir': pir_val,
                                    'tsPct': ts_pct, 'efgPct': efg_pct,
                                    'started': started,
                                    'pid': pid, 'gid': game_id, 'tid': ptid,
                                }
                            )
                            updated += 1

                        if (gidx + 1) % 20 == 0:
                            session.commit()
                            print(f"    Processed {gidx+1}/{len(game_ids)} games ({updated} rows updated)")

                    except Exception as e:
                        print(f"    [WARN] Game {game_id}: {e}")
                        continue

                session.commit()
                print(f"  [OK] Updated {updated} PlayerGameLog rows with advanced stats for team {team_id}")


def run(seasons=None, team_ids=None):
    """Run the full advanced stats fetch."""
    lineups = fetch_lineup_stats(seasons, team_ids)
    enrich_player_game_logs_advanced(seasons, team_ids)
    print(f"[ADVANCED] Complete: {len(lineups)} lineup records")
    return lineups


if __name__ == '__main__':
    run()
