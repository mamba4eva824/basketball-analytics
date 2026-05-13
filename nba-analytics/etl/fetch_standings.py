"""
Fetch current standings and team season stats.
Populates: Standing, TeamSeasonStats tables.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime

from nba_api.stats.endpoints import (
    LeagueStandings,
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


def fetch_standings(seasons=None):
    """
    Fetch league standings and populate the Standing table.
    """
    if seasons is None:
        seasons = [CURRENT_SEASON_YEAR]

    print(f"[STANDINGS] Fetching standings for {len(seasons)} season(s)...")

    all_rows = []
    snapshot_date = datetime.utcnow()

    for season in seasons:
        print(f"  Season {season}...")
        try:
            dfs = safe_call(
                LeagueStandings,
                season=season,
                league_id='00',
                season_type='Regular Season',
            )
            if not dfs or len(dfs) == 0 or dfs[0].empty:
                print(f"    No standings data for {season}")
                continue

            standings_df = dfs[0]
            print(f"    Found {len(standings_df)} team standings")

            for _, row in standings_df.iterrows():
                team_id = str(row.get('TeamID', ''))
                if not team_id:
                    continue

                wins = safe_int(row.get('WINS'), 0)
                losses = safe_int(row.get('LOSSES'), 0)
                total_games = wins + losses

                standing_row = {
                    'id': generate_cuid(),
                    'teamId': team_id,
                    'season': season,
                    'seasonId': season,
                    'asOfDate': snapshot_date,
                    'wins': wins,
                    'losses': losses,
                    'winPct': safe_float(row.get('WinPCT'), 0.0),
                    'gamesBehind': safe_float(row.get('ConferenceGamesBack'), 0.0),
                    'streak': str(row.get('strCurrentStreak', '')) or None,
                    'lastTenWins': safe_int(row.get('L10_W')),
                    'lastTenLosses': safe_int(row.get('L10_L')),
                    'conferenceRank': safe_int(row.get('ConferenceRecord', '').split('-')[0]) if False else safe_int(row.get('PlayoffRank')),
                    'divisionRank': safe_int(row.get('DivisionRank')),
                    'leagueRank': safe_int(row.get('LeagueRank')),
                    'playoffSeed': safe_int(row.get('PlayoffRank')),
                    'homeWins': None,
                    'homeLosses': None,
                    'awayWins': None,
                    'awayLosses': None,
                    'confWins': None,
                    'confLosses': None,
                    'divWins': None,
                    'divLosses': None,
                    'clinchStatus': str(row.get('ClinchedPostSeason', '')) or None,
                    'pointsFor': safe_float(row.get('PointsPG')),
                    'pointsAgainst': safe_float(row.get('OppPointsPG')),
                    'pointDiff': safe_float(row.get('DiffPointsPG')),
                    'createdAt': datetime.utcnow(),
                    'updatedAt': datetime.utcnow(),
                }

                # Parse record splits from available data
                home_record = str(row.get('HOME', ''))
                if '-' in home_record:
                    parts = home_record.split('-')
                    standing_row['homeWins'] = safe_int(parts[0])
                    standing_row['homeLosses'] = safe_int(parts[1])

                road_record = str(row.get('ROAD', ''))
                if '-' in road_record:
                    parts = road_record.split('-')
                    standing_row['awayWins'] = safe_int(parts[0])
                    standing_row['awayLosses'] = safe_int(parts[1])

                conf_record = str(row.get('ConferenceRecord', ''))
                if '-' in conf_record:
                    parts = conf_record.split('-')
                    standing_row['confWins'] = safe_int(parts[0])
                    standing_row['confLosses'] = safe_int(parts[1])

                div_record = str(row.get('DivisionRecord', ''))
                if '-' in div_record:
                    parts = div_record.split('-')
                    standing_row['divWins'] = safe_int(parts[0])
                    standing_row['divLosses'] = safe_int(parts[1])

                # L10 split
                l10 = str(row.get('L10', ''))
                if '-' in l10:
                    parts = l10.split('-')
                    standing_row['lastTenWins'] = safe_int(parts[0])
                    standing_row['lastTenLosses'] = safe_int(parts[1])

                all_rows.append(standing_row)

        except Exception as e:
            print(f"  [ERROR] Standings for season {season}: {e}")
            continue

    # Upsert into Standing
    if all_rows:
        columns = [
            'id', 'teamId', 'season', 'seasonId', 'asOfDate',
            'wins', 'losses', 'winPct', 'gamesBehind',
            'streak', 'lastTenWins', 'lastTenLosses',
            'conferenceRank', 'divisionRank', 'leagueRank', 'playoffSeed',
            'homeWins', 'homeLosses', 'awayWins', 'awayLosses',
            'confWins', 'confLosses', 'divWins', 'divLosses',
            'clinchStatus',
            'pointsFor', 'pointsAgainst', 'pointDiff',
            'createdAt', 'updatedAt',
        ]
        with get_db() as session:
            count = upsert_rows(
                session, 'Standing', all_rows, columns,
                ['teamId', 'season', 'asOfDate'],
                exclude_from_update={'id', 'createdAt'},
            )
            session.commit()
            print(f"  [OK] Upserted {count} Standing records")

    return all_rows


def fetch_team_season_stats(seasons=None, team_ids=None):
    """
    Fetch team-level season stats from LeagueDashTeamStats.
    Populates the TeamSeasonStats table.
    """
    if seasons is None:
        seasons = BACKFILL_SEASONS

    print(f"[TEAM SEASON STATS] Fetching for {len(seasons)} season(s)...")

    all_rows = []
    for season in seasons:
        print(f"  Season {season}...")

        # First fetch base stats
        try:
            dfs = safe_call(
                LeagueDashTeamStats,
                season=season,
                measure_type_detailed_defense='Base',
                per_mode_detailed='PerGame',
                season_type_all_star='Regular Season',
            )
            if not dfs or len(dfs) == 0 or dfs[0].empty:
                print(f"    No base stats for {season}")
                continue

            base_df = dfs[0]
            if team_ids:
                base_df = base_df[base_df['TEAM_ID'].astype(str).isin([str(t) for t in team_ids])]

            # Also fetch advanced stats
            adv_df = None
            try:
                adv_dfs = safe_call(
                    LeagueDashTeamStats,
                    season=season,
                    measure_type_detailed_defense='Advanced',
                    per_mode_detailed='PerGame',
                    season_type_all_star='Regular Season',
                )
                if adv_dfs and len(adv_dfs) > 0 and not adv_dfs[0].empty:
                    adv_df = adv_dfs[0]
                    if team_ids:
                        adv_df = adv_df[adv_df['TEAM_ID'].astype(str).isin([str(t) for t in team_ids])]
            except Exception as e:
                print(f"    [WARN] Could not fetch advanced team stats: {e}")

            # Build lookup for advanced stats
            adv_lookup = {}
            if adv_df is not None:
                for _, arow in adv_df.iterrows():
                    adv_lookup[str(arow.get('TEAM_ID', ''))] = arow

            # Also try to get opponent stats and scoring breakdown
            opp_df = None
            try:
                # Fetch opponent stats
                opp_dfs = safe_call(
                    LeagueDashTeamStats,
                    season=season,
                    measure_type_detailed_defense='Opponent',
                    per_mode_detailed='PerGame',
                    season_type_all_star='Regular Season',
                )
                if opp_dfs and len(opp_dfs) > 0 and not opp_dfs[0].empty:
                    opp_df = opp_dfs[0]
            except Exception:
                pass

            opp_lookup = {}
            if opp_df is not None:
                for _, orow in opp_df.iterrows():
                    opp_lookup[str(orow.get('TEAM_ID', ''))] = orow

            for _, row in base_df.iterrows():
                tid = str(row.get('TEAM_ID', ''))
                if not tid:
                    continue

                wins = safe_int(row.get('W'), 0)
                losses = safe_int(row.get('L'), 0)
                gp = safe_int(row.get('GP'), 0)

                stat_row = {
                    'id': generate_cuid(),
                    'teamId': tid,
                    'season': season,
                    'seasonId': season,
                    'gamesPlayed': gp,
                    'wins': wins,
                    'losses': losses,
                    'winPct': pct_to_decimal(row.get('W_PCT')),
                    'pointsPerGame': safe_float(row.get('PTS')),
                    'oppPointsPerGame': None,
                    'fieldGoalPct': pct_to_decimal(row.get('FG_PCT')),
                    'threePointPct': pct_to_decimal(row.get('FG3_PCT')),
                    'freeThrowPct': pct_to_decimal(row.get('FT_PCT')),
                    'reboundsPerGame': safe_float(row.get('REB')),
                    'assistsPerGame': safe_float(row.get('AST')),
                    'stealsPerGame': safe_float(row.get('STL')),
                    'blocksPerGame': safe_float(row.get('BLK')),
                    'turnoversPerGame': safe_float(row.get('TOV')),
                    # Advanced
                    'offRating': None,
                    'defRating': None,
                    'netRating': None,
                    'pace': None,
                    'effectiveFgPct': None,
                    'trueShootingPct': None,
                    'turnoverPct': None,
                    'offReboundPct': None,
                    'freeThrowRate': None,
                    'oppEffectiveFgPct': None,
                    'oppTurnoverPct': None,
                    'oppFreeThrowRate': None,
                    # Scoring breakdown
                    'fastBreakPtsPerGame': None,
                    'ptsInPaintPerGame': None,
                    'ptsOffTurnoversPerGame': None,
                    'secondChancePtsPerGame': None,
                    'createdAt': datetime.utcnow(),
                    'updatedAt': datetime.utcnow(),
                }

                # Fill in opponent PPG
                if tid in opp_lookup:
                    stat_row['oppPointsPerGame'] = safe_float(opp_lookup[tid].get('OPP_PTS'))

                # Fill in advanced stats
                if tid in adv_lookup:
                    arow = adv_lookup[tid]
                    stat_row['offRating'] = safe_float(arow.get('OFF_RATING'))
                    stat_row['defRating'] = safe_float(arow.get('DEF_RATING'))
                    stat_row['netRating'] = safe_float(arow.get('NET_RATING'))
                    stat_row['pace'] = safe_float(arow.get('PACE'))
                    stat_row['effectiveFgPct'] = pct_to_decimal(arow.get('EFG_PCT'))
                    stat_row['trueShootingPct'] = pct_to_decimal(arow.get('TS_PCT'))
                    stat_row['turnoverPct'] = pct_to_decimal(arow.get('TM_TOV_PCT'))
                    stat_row['offReboundPct'] = pct_to_decimal(arow.get('OREB_PCT'))
                    stat_row['freeThrowRate'] = safe_float(arow.get('FTA_RATE'))
                    stat_row['oppEffectiveFgPct'] = pct_to_decimal(arow.get('OPP_EFG_PCT'))
                    stat_row['oppTurnoverPct'] = pct_to_decimal(arow.get('OPP_TOV_PCT'))
                    stat_row['oppFreeThrowRate'] = safe_float(arow.get('OPP_FTA_RATE'))

                all_rows.append(stat_row)

            print(f"    Processed {len(base_df)} teams")

        except Exception as e:
            print(f"  [ERROR] Team season stats for {season}: {e}")
            continue

    # Now try to get scoring breakdown data
    for season in seasons:
        try:
            misc_dfs = safe_call(
                LeagueDashTeamStats,
                season=season,
                measure_type_detailed_defense='Misc',
                per_mode_detailed='PerGame',
                season_type_all_star='Regular Season',
            )
            if misc_dfs and len(misc_dfs) > 0 and not misc_dfs[0].empty:
                misc_df = misc_dfs[0]
                misc_lookup = {}
                for _, mrow in misc_df.iterrows():
                    misc_lookup[str(mrow.get('TEAM_ID', ''))] = mrow

                for sr in all_rows:
                    if sr['season'] != season:
                        continue
                    tid = sr['teamId']
                    if tid in misc_lookup:
                        mrow = misc_lookup[tid]
                        sr['fastBreakPtsPerGame'] = safe_float(mrow.get('PTS_FB'))
                        sr['ptsInPaintPerGame'] = safe_float(mrow.get('PTS_PAINT'))
                        sr['ptsOffTurnoversPerGame'] = safe_float(mrow.get('PTS_OFF_TOV'))
                        sr['secondChancePtsPerGame'] = safe_float(mrow.get('PTS_2ND_CHANCE'))

                print(f"    Merged scoring breakdown for {season}")
        except Exception as e:
            print(f"    [WARN] Could not fetch misc stats for {season}: {e}")

    # Upsert into TeamSeasonStats
    if all_rows:
        columns = [
            'id', 'teamId', 'season', 'seasonId',
            'gamesPlayed', 'wins', 'losses', 'winPct',
            'pointsPerGame', 'oppPointsPerGame',
            'fieldGoalPct', 'threePointPct', 'freeThrowPct',
            'reboundsPerGame', 'assistsPerGame', 'stealsPerGame',
            'blocksPerGame', 'turnoversPerGame',
            'offRating', 'defRating', 'netRating', 'pace',
            'effectiveFgPct', 'trueShootingPct', 'turnoverPct',
            'offReboundPct', 'freeThrowRate',
            'oppEffectiveFgPct', 'oppTurnoverPct', 'oppFreeThrowRate',
            'fastBreakPtsPerGame', 'ptsInPaintPerGame',
            'ptsOffTurnoversPerGame', 'secondChancePtsPerGame',
            'createdAt', 'updatedAt',
        ]
        with get_db() as session:
            count = upsert_rows(
                session, 'TeamSeasonStats', all_rows, columns,
                ['teamId', 'season'],
                exclude_from_update={'id', 'createdAt'},
            )
            session.commit()
            print(f"  [OK] Upserted {count} TeamSeasonStats records")

    return all_rows


def run(seasons=None, team_ids=None):
    """Run the full standings + team season stats fetch."""
    standings = fetch_standings(seasons)
    team_stats = fetch_team_season_stats(seasons, team_ids)
    print(f"[STANDINGS] Complete: {len(standings)} standings, {len(team_stats)} team season stats")
    return standings, team_stats


if __name__ == '__main__':
    run()
