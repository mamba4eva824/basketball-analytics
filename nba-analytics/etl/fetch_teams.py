"""
Fetch all 30 NBA teams and their current rosters.
Populates: Team, Player, Season tables.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime

from nba_api.stats.static import teams as nba_teams
from nba_api.stats.endpoints import CommonTeamRoster

from config import (
    TEAM_META, CURRENT_SEASON_YEAR, BACKFILL_SEASONS,
    SEASON_METADATA,
)
from utils import (
    get_db, safe_call, generate_cuid, safe_int, safe_float,
    upsert_rows, ensure_seasons, execute_sql,
)


def fetch_all_teams():
    """Fetch all 30 NBA teams from nba_api static data and upsert into Team table."""
    print("[TEAMS] Fetching all 30 NBA teams...")

    all_teams = nba_teams.get_teams()
    print(f"  Found {len(all_teams)} teams from nba_api")

    rows = []
    for t in all_teams:
        abbrev = t['abbreviation']
        meta = TEAM_META.get(abbrev, {})

        row = {
            'id': str(t['id']),
            'abbreviation': abbrev,
            'name': t['full_name'],
            'city': t['city'],
            'nickname': t['nickname'],
            'conference': meta.get('conference', 'WEST'),
            'division': meta.get('division', 'PACIFIC'),
            'logoUrl': f"https://cdn.nba.com/logos/nba/{t['id']}/global/L/logo.svg",
            'primaryColor': meta.get('primary'),
            'secondaryColor': meta.get('secondary'),
            'createdAt': datetime.utcnow(),
            'updatedAt': datetime.utcnow(),
        }
        rows.append(row)

    columns = [
        'id', 'abbreviation', 'name', 'city', 'nickname',
        'conference', 'division', 'logoUrl', 'primaryColor', 'secondaryColor',
        'createdAt', 'updatedAt',
    ]

    with get_db() as session:
        # Ensure seasons exist first
        ensure_seasons(session, SEASON_METADATA)

        count = upsert_rows(session, 'Team', rows, columns, ['id'])
        session.commit()
        print(f"  [OK] Upserted {count} teams")

    return rows


def fetch_team_rosters(team_ids=None):
    """
    Fetch current rosters for all teams (or specified team IDs).
    Populates the Player table with roster data.
    """
    print("[ROSTERS] Fetching team rosters...")

    if team_ids is None:
        all_teams = nba_teams.get_teams()
        team_ids = [str(t['id']) for t in all_teams]

    all_players = []
    for i, team_id in enumerate(team_ids):
        print(f"  Fetching roster for team {team_id} ({i+1}/{len(team_ids)})...")
        try:
            dfs = safe_call(
                CommonTeamRoster,
                team_id=team_id,
                season=CURRENT_SEASON_YEAR,
            )
            if dfs and len(dfs) > 0:
                roster_df = dfs[0]
                for _, row in roster_df.iterrows():
                    player_id = str(row.get('PLAYER_ID', ''))
                    if not player_id:
                        continue

                    # Parse birth date
                    birth_date = None
                    bd = row.get('BIRTH_DATE')
                    if bd and str(bd).strip():
                        try:
                            birth_date = datetime.strptime(str(bd).strip()[:10], '%Y-%m-%d')
                        except ValueError:
                            try:
                                birth_date = datetime.strptime(str(bd).strip(), '%b %d, %Y')
                            except ValueError:
                                pass

                    full_name = str(row.get('PLAYER', ''))
                    name_parts = full_name.split(' ', 1)
                    first_name = name_parts[0] if name_parts else ''
                    last_name = name_parts[1] if len(name_parts) > 1 else ''

                    # Parse experience/years
                    exp = row.get('EXP')
                    from_year = None
                    to_year = None
                    if exp and str(exp).strip() and str(exp).strip() != 'R':
                        try:
                            years_exp = int(exp)
                            to_year = CURRENT_SEASON_YEAR.split('-')[0]
                            from_year = int(to_year) - years_exp
                            to_year = int(to_year)
                        except (ValueError, TypeError):
                            pass

                    player_row = {
                        'id': player_id,
                        'firstName': first_name,
                        'lastName': last_name,
                        'fullName': full_name,
                        'birthDate': birth_date,
                        'height': str(row.get('HEIGHT', '')) or None,
                        'weight': safe_int(row.get('WEIGHT')),
                        'position': str(row.get('POSITION', '')) or None,
                        'jersey': str(row.get('NUM', '')) or None,
                        'isActive': True,
                        'fromYear': from_year,
                        'toYear': to_year,
                        'draftYear': None,
                        'draftRound': None,
                        'draftPick': None,
                        'country': None,
                        'school': None,
                        'headshotUrl': f"https://cdn.nba.com/headshots/nba/latest/1040x760/{player_id}.png",
                        'teamId': str(team_id),
                        'createdAt': datetime.utcnow(),
                        'updatedAt': datetime.utcnow(),
                    }
                    all_players.append(player_row)
                print(f"    Found {len(roster_df)} players")
        except Exception as e:
            print(f"  [ERROR] Failed to fetch roster for team {team_id}: {e}")
            continue

    # Upsert all players
    columns = [
        'id', 'firstName', 'lastName', 'fullName', 'birthDate',
        'height', 'weight', 'position', 'jersey', 'isActive',
        'fromYear', 'toYear', 'draftYear', 'draftRound', 'draftPick',
        'country', 'school', 'headshotUrl', 'teamId',
        'createdAt', 'updatedAt',
    ]

    with get_db() as session:
        count = upsert_rows(session, 'Player', all_players, columns, ['id'])
        session.commit()
        print(f"  [OK] Upserted {count} players from rosters")

    return all_players


def run(team_ids=None):
    """Run the full teams + rosters fetch."""
    teams = fetch_all_teams()
    players = fetch_team_rosters(team_ids)
    print(f"[TEAMS] Complete: {len(teams)} teams, {len(players)} players")
    return teams, players


if __name__ == '__main__':
    run()
