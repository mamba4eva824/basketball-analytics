"""
Fetch game-by-game stats for teams and players.
Populates: GameBoxScore, PlayerGameLog tables.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime

from nba_api.stats.endpoints import (
    TeamGameLog,
    PlayerGameLog as PlayerGameLogEndpoint,
    BoxScoreTraditionalV2,
)
from nba_api.stats.static import teams as nba_teams

from config import (
    CURRENT_SEASON_YEAR, BACKFILL_SEASONS, LAKERS_TEAM_ID,
)
from utils import (
    get_db, safe_call, generate_cuid, safe_int, safe_float,
    pct_to_decimal, parse_date, parse_minutes,
    upsert_rows, execute_sql,
)

from sqlalchemy import text


def fetch_team_game_logs(seasons=None, team_ids=None):
    """
    Fetch team game logs for all teams across all seasons.
    Populates the GameBoxScore table.
    """
    if seasons is None:
        seasons = BACKFILL_SEASONS
    if team_ids is None:
        all_teams = nba_teams.get_teams()
        team_ids = [str(t['id']) for t in all_teams]

    print(f"[GAME LOGS] Fetching team game logs for {len(team_ids)} teams, {len(seasons)} season(s)...")

    # We collect game data keyed by gameId. Each game appears twice (once per team).
    # We'll build GameBoxScore from the pair.
    games = {}  # gameId -> dict of data

    for season in seasons:
        print(f"  Season {season}...")
        for idx, team_id in enumerate(team_ids):
            if (idx + 1) % 10 == 0:
                print(f"    Team {idx+1}/{len(team_ids)}...")
            try:
                dfs = safe_call(
                    TeamGameLog,
                    team_id=team_id,
                    season=season,
                    season_type_all_star='Regular Season',
                )
                if not dfs or len(dfs) == 0 or dfs[0].empty:
                    continue

                log_df = dfs[0]
                for _, row in log_df.iterrows():
                    game_id = str(row.get('Game_ID', ''))
                    if not game_id:
                        continue

                    matchup = str(row.get('MATCHUP', ''))
                    is_home = ' vs. ' in matchup
                    wl = str(row.get('WL', ''))
                    game_date = parse_date(row.get('GAME_DATE'))

                    team_stats = {
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

                    if game_id not in games:
                        games[game_id] = {
                            'gameId': game_id,
                            'gameDate': game_date,
                            'season': season,
                            'seasonId': season,
                            'isPlayoff': False,
                        }

                    # Store matchup and plus_minus for single-team opponent derivation
                    games[game_id]['_matchup'] = matchup
                    plus_minus_val = safe_float(row.get('PLUS_MINUS'))
                    if plus_minus_val is not None:
                        games[game_id]['_plusMinus'] = plus_minus_val

                    prefix = 'home' if is_home else 'away'
                    games[game_id][f'{prefix}TeamId'] = str(team_id)
                    for stat_key, stat_val in team_stats.items():
                        games[game_id][f'{prefix}{stat_key}'] = stat_val

            except Exception as e:
                print(f"    [ERROR] Team {team_id} season {season}: {e}")
                continue

    # For single-team fetches, fill in the missing side with placeholder opponent data.
    # TeamGameLog MATCHUP has the opponent abbreviation (e.g. "LAL vs. BOS" or "LAL @ BOS").
    # We can derive opponent team ID and use PLUS_MINUS to estimate opponent points.
    team_abbr_to_id = {t['abbreviation']: str(t['id']) for t in nba_teams.get_teams()}

    for game_id, game_data in games.items():
        has_home = 'homeTeamId' in game_data
        has_away = 'awayTeamId' in game_data
        if has_home and not has_away:
            # We have home data, need away placeholder
            matchup = game_data.get('_matchup', '')
            opp_abbr = matchup.split(' vs. ')[-1].strip() if ' vs. ' in matchup else ''
            opp_id = team_abbr_to_id.get(opp_abbr, 'UNKNOWN')
            game_data['awayTeamId'] = opp_id
            # Estimate opponent points from PLUS_MINUS
            home_pts = game_data.get('homePoints', 0)
            plus_minus = game_data.get('_plusMinus', 0) or 0
            opp_pts = home_pts - plus_minus
            game_data['awayPoints'] = int(opp_pts)
            # Zero out remaining opponent stats
            for stat in ['FieldGoals', 'FieldGoalAtt', 'ThreePointers', 'ThreePointAtt',
                         'FreeThrows', 'FreeThrowAtt', 'ReboundsTotal', 'Assists',
                         'Steals', 'Blocks', 'Turnovers']:
                game_data.setdefault(f'away{stat}', 0)
        elif has_away and not has_home:
            matchup = game_data.get('_matchup', '')
            opp_abbr = matchup.split(' @ ')[-1].strip() if ' @ ' in matchup else ''
            opp_id = team_abbr_to_id.get(opp_abbr, 'UNKNOWN')
            game_data['homeTeamId'] = opp_id
            away_pts = game_data.get('awayPoints', 0)
            plus_minus = game_data.get('_plusMinus', 0) or 0
            opp_pts = away_pts - plus_minus
            game_data['homePoints'] = int(opp_pts)
            for stat in ['FieldGoals', 'FieldGoalAtt', 'ThreePointers', 'ThreePointAtt',
                         'FreeThrows', 'FreeThrowAtt', 'ReboundsTotal', 'Assists',
                         'Steals', 'Blocks', 'Turnovers']:
                game_data.setdefault(f'home{stat}', 0)

    # Now build GameBoxScore rows for games that have both home and away team IDs
    box_rows = []
    for game_id, game_data in games.items():
        if 'homeTeamId' not in game_data or 'awayTeamId' not in game_data:
            continue

        row = {
            'id': generate_cuid(),
            'gameId': game_data['gameId'],
            'gameDate': game_data['gameDate'],
            'season': game_data['season'],
            'seasonId': game_data['seasonId'],
            'homeTeamId': game_data['homeTeamId'],
            'awayTeamId': game_data['awayTeamId'],
            'homePoints': game_data.get('homePoints', 0),
            'homeFieldGoals': game_data.get('homeFieldGoals', 0),
            'homeFieldGoalAtt': game_data.get('homeFieldGoalAtt', 0),
            'homeFieldGoalPct': game_data.get('homeFieldGoalPct'),
            'homeThreePointers': game_data.get('homeThreePointers', 0),
            'homeThreePointAtt': game_data.get('homeThreePointAtt', 0),
            'homeThreePointPct': game_data.get('homeThreePointPct'),
            'homeFreeThrows': game_data.get('homeFreeThrows', 0),
            'homeFreeThrowAtt': game_data.get('homeFreeThrowAtt', 0),
            'homeFreeThrowPct': game_data.get('homeFreeThrowPct'),
            'homeReboundsOff': game_data.get('homeReboundsOff'),
            'homeReboundsDef': game_data.get('homeReboundsDef'),
            'homeReboundsTotal': game_data.get('homeReboundsTotal', 0),
            'homeAssists': game_data.get('homeAssists', 0),
            'homeSteals': game_data.get('homeSteals', 0),
            'homeBlocks': game_data.get('homeBlocks', 0),
            'homeTurnovers': game_data.get('homeTurnovers', 0),
            'homePersonalFouls': game_data.get('homePersonalFouls'),
            'homeFastBreakPts': game_data.get('homeFastBreakPts'),
            'homePtsInPaint': game_data.get('homePtsInPaint'),
            'homePtsOffTurnovers': game_data.get('homePtsOffTurnovers'),
            'homeSecondChancePts': game_data.get('homeSecondChancePts'),
            'awayPoints': game_data.get('awayPoints', 0),
            'awayFieldGoals': game_data.get('awayFieldGoals', 0),
            'awayFieldGoalAtt': game_data.get('awayFieldGoalAtt', 0),
            'awayFieldGoalPct': game_data.get('awayFieldGoalPct'),
            'awayThreePointers': game_data.get('awayThreePointers', 0),
            'awayThreePointAtt': game_data.get('awayThreePointAtt', 0),
            'awayThreePointPct': game_data.get('awayThreePointPct'),
            'awayFreeThrows': game_data.get('awayFreeThrows', 0),
            'awayFreeThrowAtt': game_data.get('awayFreeThrowAtt', 0),
            'awayFreeThrowPct': game_data.get('awayFreeThrowPct'),
            'awayReboundsOff': game_data.get('awayReboundsOff'),
            'awayReboundsDef': game_data.get('awayReboundsDef'),
            'awayReboundsTotal': game_data.get('awayReboundsTotal', 0),
            'awayAssists': game_data.get('awayAssists', 0),
            'awaySteals': game_data.get('awaySteals', 0),
            'awayBlocks': game_data.get('awayBlocks', 0),
            'awayTurnovers': game_data.get('awayTurnovers', 0),
            'awayPersonalFouls': game_data.get('awayPersonalFouls'),
            'awayFastBreakPts': game_data.get('awayFastBreakPts'),
            'awayPtsInPaint': game_data.get('awayPtsInPaint'),
            'awayPtsOffTurnovers': game_data.get('awayPtsOffTurnovers'),
            'awaySecondChancePts': game_data.get('awaySecondChancePts'),
            'arena': None,
            'attendance': None,
            'isPlayoff': game_data.get('isPlayoff', False),
            'seriesId': None,
            'createdAt': datetime.utcnow(),
            'updatedAt': datetime.utcnow(),
        }
        box_rows.append(row)

    # Upsert into GameBoxScore
    if box_rows:
        columns = [
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
        with get_db() as session:
            count = upsert_rows(
                session, 'GameBoxScore', box_rows, columns,
                ['gameId'],
                exclude_from_update={'id', 'createdAt'},
            )
            session.commit()
            print(f"  [OK] Upserted {count} GameBoxScore records")

    return box_rows


def fetch_player_game_logs(seasons=None, team_ids=None):
    """
    Fetch individual player game logs for all players on specified teams.
    Populates the PlayerGameLog table.
    """
    if seasons is None:
        seasons = BACKFILL_SEASONS
    if team_ids is None:
        all_teams = nba_teams.get_teams()
        team_ids = [str(t['id']) for t in all_teams]

    print(f"[PLAYER GAME LOGS] Fetching for {len(team_ids)} teams, {len(seasons)} season(s)...")

    # Get player IDs from DB grouped by team
    with get_db() as session:
        all_player_rows = session.execute(
            text('SELECT "id", "teamId" FROM "Player" WHERE "isActive" = true AND "teamId" IS NOT NULL')
        ).fetchall()

    # Build team -> player list
    team_players = {}
    for pid, tid in all_player_rows:
        if tid in [str(t) for t in team_ids] or tid in team_ids:
            team_players.setdefault(tid, []).append(pid)

    all_log_rows = []
    for season in seasons:
        print(f"  Season {season}...")
        for team_id in team_ids:
            tid = str(team_id)
            players_on_team = team_players.get(tid, [])
            if not players_on_team:
                continue

            for pidx, player_id in enumerate(players_on_team):
                try:
                    dfs = safe_call(
                        PlayerGameLogEndpoint,
                        player_id=player_id,
                        season=season,
                        season_type_all_star='Regular Season',
                    )
                    if not dfs or len(dfs) == 0 or dfs[0].empty:
                        continue

                    log_df = dfs[0]
                    for _, row in log_df.iterrows():
                        game_id = str(row.get('Game_ID', ''))
                        if not game_id:
                            continue

                        matchup = str(row.get('MATCHUP', ''))
                        is_home = ' vs. ' in matchup
                        wl = str(row.get('WL', ''))
                        game_date = parse_date(row.get('GAME_DATE'))

                        min_decimal, min_str = parse_minutes(row.get('MIN'))

                        log_row = {
                            'id': generate_cuid(),
                            'playerId': str(player_id),
                            'teamId': tid,
                            'gameId': game_id,
                            'season': season,
                            'seasonId': season,
                            'gameDate': game_date,
                            'homeAway': 'HOME' if is_home else 'AWAY',
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
                            # Advanced stats — not available from PlayerGameLog endpoint
                            'offRating': None,
                            'defRating': None,
                            'netRating': None,
                            'assistPct': None,
                            'reboundPct': None,
                            'trueShootingPct': None,
                            'effectiveFgPct': None,
                            'usageRate': None,
                            'pace': None,
                            'pir': None,
                            'started': False,
                            'dnp': False,
                            'dnpReason': None,
                            'createdAt': datetime.utcnow(),
                            'updatedAt': datetime.utcnow(),
                        }

                        # Calculate TS% and eFG% from box score
                        fga = log_row['fieldGoalAtt']
                        fta = log_row['freeThrowAtt']
                        fgm = log_row['fieldGoals']
                        fg3m = log_row['threePointers']
                        pts = log_row['points']

                        tsa = fga + 0.44 * fta
                        if tsa > 0:
                            log_row['trueShootingPct'] = round(pts / (2 * tsa), 4)
                        if fga > 0:
                            log_row['effectiveFgPct'] = round((fgm + 0.5 * fg3m) / fga, 4)

                        # DNP detection
                        if min_decimal is None or min_decimal == 0:
                            log_row['dnp'] = True

                        all_log_rows.append(log_row)

                except Exception as e:
                    print(f"    [WARN] Player {player_id} season {season}: {e}")
                    continue

            if (team_ids.index(str(team_id)) + 1) % 5 == 0:
                print(f"    Processed {team_ids.index(str(team_id)) + 1}/{len(team_ids)} teams for season {season}")

    # Filter out rows referencing games not in GameBoxScore (FK constraint)
    if all_log_rows:
        with get_db() as session:
            result = session.execute(text('SELECT "gameId" FROM "GameBoxScore"'))
            known_game_ids = {row[0] for row in result}
        before = len(all_log_rows)
        all_log_rows = [r for r in all_log_rows if r['gameId'] in known_game_ids]
        skipped = before - len(all_log_rows)
        if skipped > 0:
            print(f"  [INFO] Skipped {skipped} player game logs (game not in GameBoxScore)")

    # Upsert into PlayerGameLog
    if all_log_rows:
        columns = [
            'id', 'playerId', 'teamId', 'gameId', 'season', 'seasonId',
            'gameDate', 'homeAway', 'result',
            'minutes', 'minutesStr',
            'points', 'fieldGoals', 'fieldGoalAtt', 'fieldGoalPct',
            'threePointers', 'threePointAtt', 'threePointPct',
            'freeThrows', 'freeThrowAtt', 'freeThrowPct',
            'reboundsOff', 'reboundsDef', 'reboundsTotal',
            'assists', 'steals', 'blocks', 'turnovers', 'personalFouls',
            'plusMinus',
            'offRating', 'defRating', 'netRating',
            'assistPct', 'reboundPct', 'trueShootingPct', 'effectiveFgPct',
            'usageRate', 'pace', 'pir',
            'started', 'dnp', 'dnpReason',
            'createdAt', 'updatedAt',
        ]

        # Batch upsert in chunks to avoid memory issues
        chunk_size = 500
        with get_db() as session:
            total = 0
            for i in range(0, len(all_log_rows), chunk_size):
                chunk = all_log_rows[i:i + chunk_size]
                count = upsert_rows(
                    session, 'PlayerGameLog', chunk, columns,
                    ['playerId', 'gameId', 'teamId'],
                    exclude_from_update={'id', 'createdAt'},
                )
                total += count
                session.commit()
                if (i + chunk_size) % 2000 == 0:
                    print(f"    Committed {total} PlayerGameLog records...")

            print(f"  [OK] Upserted {total} PlayerGameLog records")

    return all_log_rows


def run(seasons=None, team_ids=None):
    """Run the full game logs fetch."""
    box_scores = fetch_team_game_logs(seasons, team_ids)
    player_logs = fetch_player_game_logs(seasons, team_ids)
    print(f"[GAME LOGS] Complete: {len(box_scores)} box scores, {len(player_logs)} player logs")
    return box_scores, player_logs


if __name__ == '__main__':
    run()
