"""
Daily refresh — current season, all 30 teams, using league-wide endpoints (~45 API calls).

Usage:
    python refresh.py                                   # current season
    python refresh.py --skip-injuries                   # if ESPN is unreachable
    python refresh.py --season 2025-26 --skip-schedule --skip-injuries   # backfill one season
    python refresh.py --team-focus LAL --skip-lineups --skip-starters

Each step is isolated: a failure is logged and the next step still runs. A summary of
step -> status + row count is printed at the end; exit code is 1 if any required step failed.
"""

import sys
import os
import time
import argparse
import traceback

sys.path.insert(0, os.path.dirname(__file__))

from nba_api.stats.static import teams as nba_teams

from config import (
    CURRENT_SEASON_YEAR,
    previous_season, season_metadata, validate_season,
)
from utils import get_db, ensure_seasons


def get_team_id_by_abbrev(abbrev):
    """Look up a team ID by abbreviation."""
    for t in nba_teams.get_teams():
        if t['abbreviation'].upper() == abbrev.upper():
            return str(t['id'])
    return None


def _count(result):
    """Normalize a fetcher's return value (int, list, tuple of lists) into a row count."""
    if result is None:
        return 0
    if isinstance(result, bool):
        return int(result)
    if isinstance(result, int):
        return result
    if isinstance(result, tuple):
        return sum(_count(r) for r in result)
    try:
        return len(result)
    except TypeError:
        return 0


def build_steps(season, focus_team_id, skip_schedule=False, skip_injuries=False,
                skip_starters=False, skip_lineups=False):
    """Ordered list of (name, callable, optional, skipped)."""
    prev = previous_season(season)

    def teams_and_seasons():
        import fetch_teams
        teams = fetch_teams.fetch_all_teams()
        with get_db() as session:
            ensure_seasons(session, {
                season: season_metadata(season, CURRENT_SEASON_YEAR),
                prev: season_metadata(prev, CURRENT_SEASON_YEAR),
            })
        return teams

    def rosters():
        import fetch_teams
        return fetch_teams.fetch_team_rosters()

    def schedule():
        import fetch_schedule
        return fetch_schedule.fetch_schedule(season)

    def team_games():
        import fetch_league_logs
        return fetch_league_logs.fetch_league_team_logs(season)

    def player_games():
        import fetch_league_logs
        return fetch_league_logs.fetch_league_player_logs(season)

    def starters():
        import fetch_league_logs
        return fetch_league_logs.fetch_focus_team_starters(season, focus_team_id)

    def player_seasons():
        import fetch_players
        return fetch_players.fetch_player_season_stats([season, prev])

    def team_seasons_and_standings():
        import fetch_standings
        team_stats = fetch_standings.fetch_team_season_stats([season])
        standings = fetch_standings.fetch_standings([season])
        return team_stats, standings

    def lineups():
        import fetch_advanced
        return fetch_advanced.fetch_lineup_stats([season], [focus_team_id])

    def injuries():
        import fetch_injuries
        return fetch_injuries.fetch_injuries()

    return [
        ('Teams + seasons', teams_and_seasons, False, False),
        ('Rosters', rosters, False, False),
        ('Schedule', schedule, False, skip_schedule),
        ('Team games', team_games, False, False),
        ('Player games', player_games, False, False),
        ('Starters', starters, False, skip_starters),
        ('Player seasons', player_seasons, False, False),
        ('Team seasons + standings', team_seasons_and_standings, False, False),
        ('Lineups', lineups, False, skip_lineups),
        ('Injuries', injuries, True, skip_injuries),
    ]


def run_steps(steps):
    """Run steps in order, isolating failures. Returns list of (name, status, rows, seconds, optional)."""
    results = []
    total = len(steps)
    for i, (name, fn, optional, skipped) in enumerate(steps, start=1):
        print("=" * 60)
        print(f"STEP {i}/{total}: {name}{' (optional)' if optional else ''}")
        print("=" * 60)
        if skipped:
            print("  [SKIP] skipped by flag")
            results.append((name, 'skipped', 0, 0.0, optional))
            print()
            continue
        start = time.time()
        try:
            rows = _count(fn())
            status = 'ok' if rows > 0 else 'empty'
        except Exception as e:
            print(f"  [ERROR] {name} failed: {e}")
            traceback.print_exc()
            rows, status = 0, 'failed'
        results.append((name, status, rows, time.time() - start, optional))
        print()
    return results


def print_summary(results):
    print("=" * 60)
    print("  REFRESH SUMMARY")
    print("=" * 60)
    width = max(len(r[0]) for r in results) if results else 10
    print(f"  {'Step'.ljust(width)}  {'Status':8}  {'Rows':>7}  {'Time':>7}")
    print(f"  {'-' * width}  {'-' * 8}  {'-' * 7}  {'-' * 7}")
    for name, status, rows, secs, optional in results:
        label = status + ('*' if optional and status == 'failed' else '')
        print(f"  {name.ljust(width)}  {label:8}  {rows:>7}  {secs:>6.1f}s")
    print("  (empty = step ran but wrote no rows; check its log above)")


def main(argv=None):
    parser = argparse.ArgumentParser(description='Daily NBA data refresh (league-wide endpoints)')
    parser.add_argument('--season', type=str, default=None,
                        help=f'Season to refresh, e.g. 2025-26 (default: current, {CURRENT_SEASON_YEAR})')
    parser.add_argument('--skip-schedule', action='store_true', help='Skip ScheduleLeagueV2')
    parser.add_argument('--skip-injuries', action='store_true', help='Skip the ESPN injury report')
    parser.add_argument('--skip-starters', action='store_true',
                        help='Skip BoxScoreTraditionalV3 starter flags for focus-team games')
    parser.add_argument('--skip-lineups', action='store_true', help='Skip focus-team lineups')
    parser.add_argument('--team-focus', type=str, default='LAL',
                        help='Focus team abbreviation for starters + lineups (default: LAL)')
    args = parser.parse_args(argv)

    try:
        season = validate_season(args.season) if args.season else CURRENT_SEASON_YEAR
    except ValueError as e:
        parser.error(str(e))
    focus_team_id = get_team_id_by_abbrev(args.team_focus)
    if focus_team_id is None:
        parser.error(f'Unknown team abbreviation: {args.team_focus}')

    print("=" * 60)
    print("  NBA Analytics — Daily Refresh")
    print(f"  Season: {season} (previous: {previous_season(season)})")
    print(f"  Focus team: {args.team_focus.upper()} ({focus_team_id})")
    print("=" * 60)
    print()

    started = time.time()
    steps = build_steps(
        season, focus_team_id,
        skip_schedule=args.skip_schedule,
        skip_injuries=args.skip_injuries,
        skip_starters=args.skip_starters,
        skip_lineups=args.skip_lineups,
    )
    results = run_steps(steps)
    print_summary(results)
    elapsed = time.time() - started
    print(f"  Finished in {elapsed:.1f}s ({elapsed / 60:.1f} min)")

    failed_required = [r[0] for r in results if r[1] == 'failed' and not r[4]]
    if failed_required:
        print(f"  [FAILED] required step(s): {', '.join(failed_required)}")
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
