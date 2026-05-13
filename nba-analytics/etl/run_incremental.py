"""
Incremental ETL — daily update that only fetches recent games and standings.
Designed to be run on a cron schedule (e.g. daily at 6 AM).

Usage:
    python run_incremental.py                # Update all teams, current season
    python run_incremental.py --team LAL     # Update only Lakers
    python run_incremental.py --days 3       # Look back 3 days for missed updates
"""

import sys
import os
import time
import argparse
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(__file__))

from nba_api.stats.static import teams as nba_teams

from config import (
    CURRENT_SEASON_YEAR, LAKERS_TEAM_ID, SEASON_METADATA,
)
from utils import get_db, ensure_seasons

from sqlalchemy import text


def get_team_id_by_abbrev(abbrev):
    """Look up a team ID by abbreviation."""
    all_teams = nba_teams.get_teams()
    for t in all_teams:
        if t['abbreviation'].upper() == abbrev.upper():
            return str(t['id'])
    return None


def get_recent_game_ids(session, since_date, team_ids=None):
    """Get game IDs from the last N days."""
    if team_ids:
        placeholders = ', '.join(f':t{i}' for i in range(len(team_ids)))
        params = {'since': since_date}
        for i, tid in enumerate(team_ids):
            params[f't{i}'] = tid
        result = session.execute(
            text(f"""
                SELECT "gameId" FROM "GameBoxScore"
                WHERE "gameDate" >= :since
                AND ("homeTeamId" IN ({placeholders}) OR "awayTeamId" IN ({placeholders}))
            """),
            params
        )
    else:
        result = session.execute(
            text('SELECT "gameId" FROM "GameBoxScore" WHERE "gameDate" >= :since'),
            {'since': since_date}
        )
    return [r[0] for r in result.fetchall()]


def run_incremental(team_ids=None, lookback_days=1):
    """
    Run an incremental update:
    1. Refresh rosters (trades, signings)
    2. Fetch new game box scores (current season only)
    3. Fetch new player game logs
    4. Update team season stats
    5. Update standings
    6. Refresh efficiency ratings for new games
    7. Refresh efficiency snapshots
    """
    start_time = time.time()
    seasons = [CURRENT_SEASON_YEAR]
    since_date = datetime.utcnow() - timedelta(days=lookback_days)

    print("=" * 60)
    print("  NBA Analytics — Incremental Update")
    print(f"  Date: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}")
    print(f"  Season: {CURRENT_SEASON_YEAR}")
    print(f"  Teams: {'ALL 30' if team_ids is None else team_ids}")
    print(f"  Lookback: {lookback_days} day(s) (since {since_date.strftime('%Y-%m-%d')})")
    print("=" * 60)
    print()

    # Ensure seasons exist
    with get_db() as session:
        ensure_seasons(session, {CURRENT_SEASON_YEAR: SEASON_METADATA[CURRENT_SEASON_YEAR]})

    # ── Step 1: Refresh Rosters ───────────────────────────────────────────
    print("[1/7] Refreshing rosters...")
    import fetch_teams
    fetch_teams.fetch_team_rosters(team_ids)
    print()

    # ── Step 2: New Game Box Scores ───────────────────────────────────────
    print("[2/7] Fetching new game box scores...")
    import fetch_game_logs
    fetch_game_logs.fetch_team_game_logs(seasons, team_ids)
    print()

    # ── Step 3: New Player Game Logs ──────────────────────────────────────
    print("[3/7] Fetching new player game logs...")
    fetch_game_logs.fetch_player_game_logs(seasons, team_ids)
    print()

    # ── Step 4: Player Season Stats ───────────────────────────────────────
    print("[4/7] Updating player season stats...")
    import fetch_players
    if team_ids and len(team_ids) == 1:
        fetch_players.fetch_player_season_stats(seasons, team_ids[0])
    else:
        fetch_players.fetch_player_season_stats(seasons)
    print()

    # ── Step 5: Team Season Stats & Standings ─────────────────────────────
    print("[5/7] Updating team season stats & standings...")
    import fetch_standings
    fetch_standings.fetch_team_season_stats(seasons, team_ids)
    fetch_standings.fetch_standings(seasons)
    print()

    # ── Step 6: Efficiency Ratings ────────────────────────────────────────
    print("[6/7] Updating efficiency ratings...")
    import fetch_efficiency
    fetch_efficiency.fetch_team_game_efficiency(seasons, team_ids)
    fetch_efficiency.fetch_efficiency_snapshots(seasons, team_ids)
    print()

    # ── Step 7: Advanced Stats Enrichment ─────────────────────────────────
    print("[7/7] Enriching game logs with advanced stats...")
    import fetch_advanced
    enrich_teams = team_ids if team_ids else [LAKERS_TEAM_ID]
    fetch_advanced.enrich_player_game_logs_advanced(seasons, enrich_teams)
    print()

    elapsed = time.time() - start_time
    print("=" * 60)
    print(f"  INCREMENTAL UPDATE COMPLETE in {elapsed:.1f}s ({elapsed/60:.1f} min)")
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description='NBA Analytics Incremental ETL')
    parser.add_argument('--team', type=str, default=None,
                        help='Team abbreviation (e.g. LAL). Omit for all 30 teams.')
    parser.add_argument('--days', type=int, default=1,
                        help='Lookback period in days (default: 1)')
    args = parser.parse_args()

    team_ids = None
    if args.team:
        tid = get_team_id_by_abbrev(args.team)
        if tid is None:
            print(f"Unknown team abbreviation: {args.team}")
            sys.exit(1)
        team_ids = [tid]

    run_incremental(team_ids, args.days)


if __name__ == '__main__':
    main()
