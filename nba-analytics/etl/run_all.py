"""
Full ETL Orchestrator — runs all fetchers in dependency order.
This is a historical backfill: pulls data for all 30 teams across multiple seasons.

Usage:
    python run_all.py                    # Full backfill for all teams, all seasons
    python run_all.py --current-only     # Only current season
    python run_all.py --team LAL         # Only Lakers
    python run_all.py --team LAL --current-only  # Lakers, current season only
"""

import sys
import os
import time
import argparse

sys.path.insert(0, os.path.dirname(__file__))

from nba_api.stats.static import teams as nba_teams

from config import (
    CURRENT_SEASON_YEAR, BACKFILL_SEASONS, LAKERS_TEAM_ID, SEASON_METADATA,
)
from utils import get_db, ensure_seasons


def get_team_id_by_abbrev(abbrev):
    """Look up a team ID by abbreviation."""
    all_teams = nba_teams.get_teams()
    for t in all_teams:
        if t['abbreviation'].upper() == abbrev.upper():
            return str(t['id'])
    return None


def run_full_pipeline(seasons=None, team_ids=None, skip_shots=False):
    """
    Run the complete ETL pipeline in dependency order:
    1. Teams + Seasons (foundation)
    2. Players + Rosters
    3. Game box scores
    4. Player game logs
    5. Player season stats
    6. Team season stats + Standings
    7. Efficiency (game-level + snapshots)
    8. Advanced (lineups + enrichment)
    9. Shot charts (most data-intensive, optional skip)
    """
    start_time = time.time()

    if seasons is None:
        seasons = BACKFILL_SEASONS

    print("=" * 60)
    print("  NBA Analytics — Full ETL Pipeline")
    print(f"  Seasons: {seasons}")
    print(f"  Teams: {'ALL 30' if team_ids is None else team_ids}")
    print("=" * 60)
    print()

    # ── Step 1: Teams & Seasons ───────────────────────────────────────────
    print("=" * 60)
    print("STEP 1/9: Teams & Seasons")
    print("=" * 60)
    import fetch_teams
    fetch_teams.fetch_all_teams()
    print()

    # ── Step 2: Rosters / Players ─────────────────────────────────────────
    print("=" * 60)
    print("STEP 2/9: Rosters & Players")
    print("=" * 60)
    fetch_teams.fetch_team_rosters(team_ids)
    print()

    # ── Step 3: Player Details ────────────────────────────────────────────
    print("=" * 60)
    print("STEP 3/9: Player Details (draft info, bio)")
    print("=" * 60)
    import fetch_players
    with get_db() as session:
        from fetch_players import get_team_player_ids
        if team_ids:
            all_pids = []
            for tid in team_ids:
                all_pids.extend(get_team_player_ids(session, tid))
        else:
            all_pids = get_team_player_ids(session)

    # Limit to avoid rate-limiting issues on full backfill
    if len(all_pids) > 200 and team_ids is None:
        print(f"  Limiting player details fetch to 200 players (of {len(all_pids)}) to avoid rate limits")
        all_pids = all_pids[:200]

    fetch_players.fetch_player_details(all_pids)
    print()

    # ── Step 4: Game Box Scores ───────────────────────────────────────────
    print("=" * 60)
    print("STEP 4/9: Game Box Scores (TeamGameLog)")
    print("=" * 60)
    import fetch_game_logs
    fetch_game_logs.fetch_team_game_logs(seasons, team_ids)
    print()

    # ── Step 5: Player Game Logs ──────────────────────────────────────────
    print("=" * 60)
    print("STEP 5/9: Player Game Logs")
    print("=" * 60)
    fetch_game_logs.fetch_player_game_logs(seasons, team_ids)
    print()

    # ── Step 6: Player Season Stats ───────────────────────────────────────
    print("=" * 60)
    print("STEP 6/9: Player Season Stats (LeagueDashPlayerStats)")
    print("=" * 60)
    # team_id parameter filters the LeagueDash results
    if team_ids and len(team_ids) == 1:
        fetch_players.fetch_player_season_stats(seasons, team_ids[0])
    else:
        fetch_players.fetch_player_season_stats(seasons)
    print()

    # ── Step 7: Team Season Stats + Standings ─────────────────────────────
    print("=" * 60)
    print("STEP 7/9: Team Season Stats & Standings")
    print("=" * 60)
    import fetch_standings
    fetch_standings.fetch_team_season_stats(seasons, team_ids)
    fetch_standings.fetch_standings(seasons)
    print()

    # ── Step 8: Efficiency ────────────────────────────────────────────────
    print("=" * 60)
    print("STEP 8/9: Efficiency Ratings (game-level + snapshots)")
    print("=" * 60)
    import fetch_efficiency
    fetch_efficiency.fetch_team_game_efficiency(seasons, team_ids)
    fetch_efficiency.fetch_efficiency_snapshots(seasons, team_ids)
    print()

    # ── Step 9: Advanced (Lineups) ────────────────────────────────────────
    print("=" * 60)
    print("STEP 9/9: Advanced Stats (Lineups + BoxScore enrichment)")
    print("=" * 60)
    import fetch_advanced
    fetch_advanced.fetch_lineup_stats(seasons, team_ids)
    # Enrich only current season for specific teams to limit API calls
    enrich_seasons = [CURRENT_SEASON_YEAR] if CURRENT_SEASON_YEAR in seasons else seasons[:1]
    enrich_teams = team_ids if team_ids else [LAKERS_TEAM_ID]
    fetch_advanced.enrich_player_game_logs_advanced(enrich_seasons, enrich_teams)
    print()

    # ── Step 10 (optional): Shot Charts ───────────────────────────────────
    if not skip_shots:
        print("=" * 60)
        print("BONUS: Shot Charts")
        print("=" * 60)
        import fetch_shots
        shot_seasons = [CURRENT_SEASON_YEAR] if CURRENT_SEASON_YEAR in seasons else seasons[:1]
        shot_teams = team_ids if team_ids else [LAKERS_TEAM_ID]
        fetch_shots.fetch_shot_charts(shot_seasons, shot_teams)
        print()

    elapsed = time.time() - start_time
    print("=" * 60)
    print(f"  ETL COMPLETE in {elapsed:.1f}s ({elapsed/60:.1f} min)")
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description='NBA Analytics Full ETL Pipeline')
    parser.add_argument('--current-only', action='store_true',
                        help='Only fetch current season data')
    parser.add_argument('--team', type=str, default=None,
                        help='Team abbreviation (e.g. LAL, BOS). Omit for all 30 teams.')
    parser.add_argument('--skip-shots', action='store_true',
                        help='Skip the shot chart data fetch (saves significant time)')
    args = parser.parse_args()

    seasons = [CURRENT_SEASON_YEAR] if args.current_only else BACKFILL_SEASONS
    team_ids = None

    if args.team:
        tid = get_team_id_by_abbrev(args.team)
        if tid is None:
            print(f"Unknown team abbreviation: {args.team}")
            sys.exit(1)
        team_ids = [tid]
        print(f"Filtering to team: {args.team} (ID: {tid})")

    run_full_pipeline(seasons, team_ids, skip_shots=args.skip_shots)


if __name__ == '__main__':
    main()
