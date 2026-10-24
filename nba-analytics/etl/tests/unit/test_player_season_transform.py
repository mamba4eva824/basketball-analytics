import pandas as pd

from conftest import LAKERS_ID, CELTICS_ID
from fetch_players import transform_player_season_stats, PLAYER_SEASON_COLUMNS

SEASON = '2025-26'
OLD_TEAM = '1610612742'  # DAL — a Lakers newcomer's previous team


def base(pid, tid, **kw):
    row = {
        'PLAYER_ID': int(pid), 'PLAYER_NAME': f'P{pid}', 'TEAM_ID': int(tid),
        'TEAM_ABBREVIATION': 'X', 'AGE': 27.0, 'GP': 70, 'W': 40, 'L': 30, 'W_PCT': 0.571,
        'MIN': 34.5, 'FGM': 9.1, 'FGA': 19.0, 'FG_PCT': 0.479, 'FG3M': 2.5, 'FG3A': 6.8,
        'FG3_PCT': 0.368, 'FTM': 5.0, 'FTA': 6.1, 'FT_PCT': 0.82, 'OREB': 1.0, 'DREB': 6.5,
        'REB': 7.5, 'AST': 8.0, 'TOV': 3.2, 'STL': 1.1, 'BLK': 0.6, 'BLKA': 0.5, 'PF': 1.9,
        'PFD': 5.0, 'PTS': 25.7, 'PLUS_MINUS': 4.2,
    }
    row.update(kw)
    return row


def adv(pid, tid, **kw):
    row = {
        'PLAYER_ID': int(pid), 'TEAM_ID': int(tid), 'OFF_RATING': 118.2, 'DEF_RATING': 112.0,
        'NET_RATING': 6.2, 'AST_PCT': 0.35, 'REB_PCT': 0.11, 'TS_PCT': 0.61, 'EFG_PCT': 0.55,
        'USG_PCT': 0.31, 'PIE': 0.17,
    }
    row.update(kw)
    return row


def test_maps_base_and_advanced_league_wide():
    base_df = pd.DataFrame([base('1629029', OLD_TEAM), base('2544', LAKERS_ID, GP=60), base('1628369', CELTICS_ID)])
    adv_df = pd.DataFrame([adv('1629029', OLD_TEAM), adv('2544', LAKERS_ID, PIE=0.15)])
    rows = transform_player_season_stats(base_df, adv_df, SEASON)
    by_pid = {r['playerId']: r for r in rows}
    assert set(by_pid) == {'1629029', '2544', '1628369'}

    newcomer = by_pid['1629029']
    assert newcomer['teamId'] == OLD_TEAM          # kept with his previous team
    assert newcomer['season'] == SEASON and newcomer['seasonId'] == SEASON
    assert newcomer['gamesPlayed'] == 70
    assert newcomer['pointsPerGame'] == 25.7
    assert newcomer['fieldGoalPct'] == 0.479
    assert newcomer['reboundsOffPerGame'] == 1.0 and newcomer['reboundsDefPerGame'] == 6.5
    assert newcomer['totalPoints'] == int(25.7 * 70)
    assert newcomer['trueShootingPct'] == 0.61 and newcomer['usageRate'] == 0.31
    assert newcomer['offRating'] == 118.2 and newcomer['netRating'] == 6.2
    assert newcomer['per'] == 0.17                 # PIE stored as-is
    assert newcomer['winShares'] is None

    assert by_pid['2544']['per'] == 0.15
    assert by_pid['1628369']['trueShootingPct'] is None   # no advanced row
    for r in rows:
        assert set(PLAYER_SEASON_COLUMNS) <= set(r)


def test_percentages_as_whole_numbers_are_normalized():
    rows = transform_player_season_stats(
        pd.DataFrame([base('2544', LAKERS_ID, FG_PCT=47.9)]),
        pd.DataFrame([adv('2544', LAKERS_ID, TS_PCT=61.0, USG_PCT=31.0)]),
        SEASON,
    )
    assert rows[0]['fieldGoalPct'] == 0.479
    assert rows[0]['trueShootingPct'] == 0.61
    assert rows[0]['usageRate'] == 0.31


def test_filters_unknown_players_and_teams():
    base_df = pd.DataFrame([
        base('2544', LAKERS_ID),
        base('1629029', OLD_TEAM),
        base('77777', LAKERS_ID),          # retired / not on any roster
        base('1628369', '1610612799'),     # unknown team id
    ])
    rows = transform_player_season_stats(
        base_df, None, SEASON,
        known_player_ids={'2544', '1629029', '1628369'},
        known_team_ids={LAKERS_ID, OLD_TEAM, CELTICS_ID},
    )
    assert sorted(r['playerId'] for r in rows) == ['1629029', '2544']


def test_zero_games_has_no_totals_and_empty_input():
    rows = transform_player_season_stats(pd.DataFrame([base('2544', LAKERS_ID, GP=0)]), None, SEASON)
    assert rows[0]['totalPoints'] is None
    assert transform_player_season_stats(pd.DataFrame(), None, SEASON) == []
    assert transform_player_season_stats(None, None, SEASON) == []
