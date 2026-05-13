"""
Fetch per-game efficiency ratings and windowed snapshots.
Populates: TeamGameEfficiency, TeamEfficiencySnapshot tables.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime

from nba_api.stats.endpoints import (
    LeagueDashTeamStats,
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


def estimate_game_efficiency(game_row):
    """
    Estimate per-game OffRtg/DefRtg from traditional box score data.
    Uses the standard possession formula.
    """
    fga = game_row.get('fga', 0) or 0
    oreb = game_row.get('oreb', 0) or 0
    tov = game_row.get('tov', 0) or 0
    fta = game_row.get('fta', 0) or 0
    pts = game_row.get('pts', 0) or 0
    plus_minus = game_row.get('plus_minus', 0) or 0

    poss = fga - oreb + tov + (0.44 * fta)
    opp_pts = pts - plus_minus

    result = {
        'possessions': round(poss, 1) if poss > 0 else None,
        'offRating': round((pts / poss) * 100, 1) if poss > 0 else None,
        'defRating': round((opp_pts / poss) * 100, 1) if poss > 0 else None,
        'netRating': round(((pts - opp_pts) / poss) * 100, 1) if poss > 0 else None,
        'pace': round(poss * (48.0 / 48.0), 1) if poss > 0 else None,  # normalize to 48 min
    }
    return result


def fetch_team_game_efficiency(seasons=None, team_ids=None):
    """
    Calculate per-game efficiency estimates from existing GameBoxScore data.
    Populates the TeamGameEfficiency table.
    """
    if seasons is None:
        seasons = BACKFILL_SEASONS
    if team_ids is None:
        all_teams = nba_teams.get_teams()
        team_ids = [str(t['id']) for t in all_teams]

    print(f"[EFFICIENCY] Computing per-game efficiency for {len(team_ids)} teams, {len(seasons)} season(s)...")

    all_rows = []
    with get_db() as session:
        for season in seasons:
            print(f"  Season {season}...")
            for team_id in team_ids:
                tid = str(team_id)

                # Get home games
                home_games = session.execute(
                    text("""
                        SELECT "gameId", "gameDate",
                               "homePoints", "homeFieldGoalAtt", "homeReboundsOff",
                               "homeTurnovers", "homeFreeThrowAtt",
                               "awayPoints",
                               "homeFieldGoals", "homeThreePointers"
                        FROM "GameBoxScore"
                        WHERE "season" = :season AND "homeTeamId" = :tid
                    """),
                    {'season': season, 'tid': tid}
                ).fetchall()

                for g in home_games:
                    game_id, game_date, pts, fga, oreb, tov, fta, opp_pts, fgm, fg3m = g
                    plus_minus = (pts or 0) - (opp_pts or 0)
                    eff = estimate_game_efficiency({
                        'fga': fga, 'oreb': oreb, 'tov': tov, 'fta': fta,
                        'pts': pts, 'plus_minus': plus_minus,
                    })
                    all_rows.append({
                        'id': generate_cuid(),
                        'teamId': tid,
                        'gameId': game_id,
                        'season': season,
                        'seasonId': season,
                        'gameDate': game_date,
                        'offRating': eff['offRating'],
                        'defRating': eff['defRating'],
                        'netRating': eff['netRating'],
                        'pace': eff['pace'],
                        'possessions': eff['possessions'],
                        'result': 'W' if plus_minus > 0 else 'L',
                        'homeAway': 'HOME',
                        'createdAt': datetime.utcnow(),
                        'updatedAt': datetime.utcnow(),
                    })

                # Get away games
                away_games = session.execute(
                    text("""
                        SELECT "gameId", "gameDate",
                               "awayPoints", "awayFieldGoalAtt", "awayReboundsOff",
                               "awayTurnovers", "awayFreeThrowAtt",
                               "homePoints",
                               "awayFieldGoals", "awayThreePointers"
                        FROM "GameBoxScore"
                        WHERE "season" = :season AND "awayTeamId" = :tid
                    """),
                    {'season': season, 'tid': tid}
                ).fetchall()

                for g in away_games:
                    game_id, game_date, pts, fga, oreb, tov, fta, opp_pts, fgm, fg3m = g
                    plus_minus = (pts or 0) - (opp_pts or 0)
                    eff = estimate_game_efficiency({
                        'fga': fga, 'oreb': oreb, 'tov': tov, 'fta': fta,
                        'pts': pts, 'plus_minus': plus_minus,
                    })
                    all_rows.append({
                        'id': generate_cuid(),
                        'teamId': tid,
                        'gameId': game_id,
                        'season': season,
                        'seasonId': season,
                        'gameDate': game_date,
                        'offRating': eff['offRating'],
                        'defRating': eff['defRating'],
                        'netRating': eff['netRating'],
                        'pace': eff['pace'],
                        'possessions': eff['possessions'],
                        'result': 'W' if plus_minus > 0 else 'L',
                        'homeAway': 'AWAY',
                        'createdAt': datetime.utcnow(),
                        'updatedAt': datetime.utcnow(),
                    })

    # Upsert into TeamGameEfficiency
    if all_rows:
        columns = [
            'id', 'teamId', 'gameId', 'season', 'seasonId', 'gameDate',
            'offRating', 'defRating', 'netRating', 'pace', 'possessions',
            'result', 'homeAway',
            'createdAt', 'updatedAt',
        ]
        with get_db() as session:
            chunk_size = 500
            total = 0
            for i in range(0, len(all_rows), chunk_size):
                chunk = all_rows[i:i + chunk_size]
                count = upsert_rows(
                    session, 'TeamGameEfficiency', chunk, columns,
                    ['teamId', 'gameId'],
                    exclude_from_update={'id', 'createdAt'},
                )
                total += count
                session.commit()

            print(f"  [OK] Upserted {total} TeamGameEfficiency records")

    return all_rows


def fetch_efficiency_snapshots(seasons=None, team_ids=None):
    """
    Fetch official windowed efficiency ratings from LeagueDashTeamStats.
    Captures snapshots at windows: L5, L10, L15, L20, Season.
    Populates the TeamEfficiencySnapshot table.
    """
    if seasons is None:
        seasons = [CURRENT_SEASON_YEAR]

    # Windows to capture — LastNGames parameter
    windows = {
        'L5': 5,
        'L10': 10,
        'L15': 15,
        'L20': 20,
        'Season': 0,
    }

    print(f"[SNAPSHOTS] Fetching efficiency snapshots for {len(seasons)} season(s)...")

    all_rows = []
    snapshot_date = datetime.utcnow()

    for season in seasons:
        print(f"  Season {season}...")
        for window_name, last_n in windows.items():
            print(f"    Window: {window_name}...")
            try:
                kwargs = {
                    'season': season,
                    'measure_type_detailed_defense': 'Advanced',
                    'per_mode_detailed': 'PerGame',
                    'season_type_all_star': 'Regular Season',
                }
                if last_n > 0:
                    kwargs['last_n_games'] = last_n

                dfs = safe_call(LeagueDashTeamStats, **kwargs)
                if not dfs or len(dfs) == 0 or dfs[0].empty:
                    print(f"      No data for {window_name}")
                    continue

                stats_df = dfs[0]

                # Filter to requested teams if specified
                if team_ids:
                    stats_df = stats_df[stats_df['TEAM_ID'].astype(str).isin([str(t) for t in team_ids])]

                for _, row in stats_df.iterrows():
                    tid = str(row.get('TEAM_ID', ''))
                    if not tid:
                        continue

                    snap_row = {
                        'id': generate_cuid(),
                        'teamId': tid,
                        'season': season,
                        'seasonId': season,
                        'window': window_name,
                        'snapshotDate': snapshot_date,
                        'offRating': safe_float(row.get('OFF_RATING')),
                        'defRating': safe_float(row.get('DEF_RATING')),
                        'netRating': safe_float(row.get('NET_RATING')),
                        'pace': safe_float(row.get('PACE')),
                        'wins': safe_int(row.get('W')),
                        'losses': safe_int(row.get('L')),
                        'winPct': pct_to_decimal(row.get('W_PCT')),
                        'effectiveFgPct': pct_to_decimal(row.get('EFG_PCT')),
                        'turnoverPct': pct_to_decimal(row.get('TM_TOV_PCT')),
                        'offReboundPct': pct_to_decimal(row.get('OREB_PCT')),
                        'freeThrowRate': safe_float(row.get('FTA_RATE')),
                        'oppEffectiveFgPct': pct_to_decimal(row.get('OPP_EFG_PCT')),
                        'oppTurnoverPct': pct_to_decimal(row.get('OPP_TOV_PCT')),
                        'oppOffReboundPct': pct_to_decimal(row.get('OPP_OREB_PCT')),
                        'oppFreeThrowRate': safe_float(row.get('OPP_FTA_RATE')),
                        'createdAt': datetime.utcnow(),
                        'updatedAt': datetime.utcnow(),
                    }
                    all_rows.append(snap_row)

                print(f"      Found {len(stats_df)} team records")

            except Exception as e:
                print(f"    [ERROR] Window {window_name} season {season}: {e}")
                continue

    # Upsert into TeamEfficiencySnapshot
    if all_rows:
        columns = [
            'id', 'teamId', 'season', 'seasonId', 'window', 'snapshotDate',
            'offRating', 'defRating', 'netRating', 'pace',
            'wins', 'losses', 'winPct',
            'effectiveFgPct', 'turnoverPct', 'offReboundPct', 'freeThrowRate',
            'oppEffectiveFgPct', 'oppTurnoverPct', 'oppOffReboundPct', 'oppFreeThrowRate',
            'createdAt', 'updatedAt',
        ]
        with get_db() as session:
            count = upsert_rows(
                session, 'TeamEfficiencySnapshot', all_rows, columns,
                ['teamId', 'season', 'window', 'snapshotDate'],
                exclude_from_update={'id', 'createdAt'},
            )
            session.commit()
            print(f"  [OK] Upserted {count} TeamEfficiencySnapshot records")

    return all_rows


def run(seasons=None, team_ids=None):
    """Run the full efficiency fetch."""
    eff = fetch_team_game_efficiency(seasons, team_ids)
    snaps = fetch_efficiency_snapshots(seasons, team_ids)
    print(f"[EFFICIENCY] Complete: {len(eff)} game efficiencies, {len(snaps)} snapshots")
    return eff, snaps


if __name__ == '__main__':
    run()
