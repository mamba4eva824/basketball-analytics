from datetime import datetime

import pandas as pd
import pytest

from conftest import LAKERS_ID, CELTICS_ID, WARRIORS_ID
from fetch_league_logs import (
    transform_team_game_log, transform_player_game_log, extract_starter_ids,
    GAME_BOX_COLUMNS, PLAYER_LOG_COLUMNS,
)

SEASON = '2026-27'


def team_row(game_id, team_id, abbr, matchup, wl, pts, **kw):
    row = {
        'SEASON_ID': '22026', 'TEAM_ID': int(team_id), 'TEAM_ABBREVIATION': abbr,
        'TEAM_NAME': abbr, 'GAME_ID': game_id, 'GAME_DATE': '2026-10-21',
        'MATCHUP': matchup, 'WL': wl, 'MIN': 240,
        'FGM': 40, 'FGA': 88, 'FG_PCT': 0.455, 'FG3M': 12, 'FG3A': 35, 'FG3_PCT': 0.343,
        'FTM': 18, 'FTA': 22, 'FT_PCT': 0.818, 'OREB': 10, 'DREB': 34, 'REB': 44,
        'AST': 25, 'STL': 7, 'BLK': 5, 'TOV': 13, 'PF': 19, 'PTS': pts,
        'PLUS_MINUS': 0, 'VIDEO_AVAILABLE': 1,
    }
    row.update(kw)
    return row


@pytest.fixture
def team_df():
    return pd.DataFrame([
        team_row('0022600001', LAKERS_ID, 'LAL', 'LAL vs. GSW', 'W', 112, OREB=12, DREB=36, REB=48),
        team_row('0022600001', WARRIORS_ID, 'GSW', 'GSW @ LAL', 'L', 108, OREB=8, DREB=30, REB=38, FG_PCT=0.42),
        team_row('0022600002', LAKERS_ID, 'LAL', 'LAL @ BOS', 'L', 99, GAME_DATE='2026-10-23'),
        team_row('0022600002', CELTICS_ID, 'BOS', 'BOS vs. LAL', 'W', 104, GAME_DATE='2026-10-23'),
        # orphan: only one side present
        team_row('0022600003', CELTICS_ID, 'BOS', 'BOS vs. NYK', 'W', 120),
    ])


def test_team_log_pairs_home_and_away(team_df):
    rows = {r['gameId']: r for r in transform_team_game_log(team_df, SEASON)}
    assert set(rows) == {'0022600001', '0022600002'}

    g1 = rows['0022600001']
    assert g1['homeTeamId'] == LAKERS_ID and g1['awayTeamId'] == WARRIORS_ID
    assert g1['homePoints'] == 112 and g1['awayPoints'] == 108
    assert g1['homeReboundsOff'] == 12 and g1['homeReboundsDef'] == 36 and g1['homeReboundsTotal'] == 48
    assert g1['awayReboundsOff'] == 8 and g1['awayReboundsDef'] == 30 and g1['awayReboundsTotal'] == 38
    assert g1['homeFieldGoalPct'] == 0.455 and g1['awayFieldGoalPct'] == 0.42
    assert g1['homeThreePointPct'] == 0.343
    assert g1['homePersonalFouls'] == 19
    assert g1['homeFastBreakPts'] is None
    assert g1['gameDate'] == datetime(2026, 10, 21)
    assert g1['season'] == SEASON and g1['seasonId'] == SEASON
    assert g1['isPlayoff'] is False
    assert g1['id'].startswith('c')

    g2 = rows['0022600002']
    assert g2['homeTeamId'] == CELTICS_ID and g2['awayTeamId'] == LAKERS_ID
    assert g2['homePoints'] == 104 and g2['awayPoints'] == 99
    assert g2['gameDate'] == datetime(2026, 10, 23)


def test_team_log_rows_cover_all_columns(team_df):
    for r in transform_team_game_log(team_df, SEASON):
        assert set(GAME_BOX_COLUMNS) <= set(r)


def test_team_log_known_team_filter(team_df):
    rows = transform_team_game_log(team_df, SEASON, known_team_ids={LAKERS_ID, CELTICS_ID})
    assert [r['gameId'] for r in rows] == ['0022600002']


def test_team_log_empty():
    assert transform_team_game_log(pd.DataFrame(), SEASON) == []
    assert transform_team_game_log(None, SEASON) == []


def player_row(pid, team_id, game_id, matchup, wl, minutes, **kw):
    row = {
        'SEASON_ID': '22026', 'PLAYER_ID': int(pid), 'PLAYER_NAME': f'P{pid}',
        'TEAM_ID': int(team_id), 'TEAM_ABBREVIATION': 'LAL', 'TEAM_NAME': 'Lakers',
        'GAME_ID': game_id, 'GAME_DATE': '2026-10-21', 'MATCHUP': matchup, 'WL': wl,
        'MIN': minutes, 'FGM': 10, 'FGA': 20, 'FG_PCT': 0.5, 'FG3M': 2, 'FG3A': 6,
        'FG3_PCT': 0.333, 'FTM': 5, 'FTA': 6, 'FT_PCT': 0.833, 'OREB': 1, 'DREB': 7,
        'REB': 8, 'AST': 9, 'STL': 1, 'BLK': 0, 'TOV': 3, 'PF': 2, 'PTS': 27,
        'PLUS_MINUS': 6, 'FANTASY_PTS': 50.1, 'VIDEO_AVAILABLE': 1,
    }
    row.update(kw)
    return row


@pytest.fixture
def player_df():
    return pd.DataFrame([
        player_row('2544', LAKERS_ID, '0022600001', 'LAL vs. GSW', 'W', 35),
        player_row('201939', WARRIORS_ID, '0022600001', 'GSW @ LAL', 'L', 33, PLUS_MINUS=-6),
        player_row('9999999', LAKERS_ID, '0022600001', 'LAL vs. GSW', 'W', 10),   # unknown player
        player_row('2544', LAKERS_ID, '0022600099', 'LAL @ BOS', 'L', 30),        # unknown game
        player_row('1630559', LAKERS_ID, '0022600001', 'LAL vs. GSW', 'W', 0,
                   FGM=0, FGA=0, FG_PCT=None, FG3M=0, FG3A=0, FTM=0, FTA=0, PTS=0),
    ])


def test_player_log_maps_and_filters(player_df):
    rows = transform_player_game_log(
        player_df, SEASON,
        known_player_ids={'2544', '201939', '1630559'},
        game_ids={'0022600001'},
    )
    by_key = {(r['playerId'], r['gameId']): r for r in rows}
    assert set(by_key) == {('2544', '0022600001'), ('201939', '0022600001'), ('1630559', '0022600001')}

    lebron = by_key[('2544', '0022600001')]
    assert lebron['teamId'] == LAKERS_ID
    assert lebron['homeAway'] == 'HOME' and lebron['result'] == 'W'
    assert lebron['minutes'] == 35.0 and lebron['minutesStr'] == '35:00'
    assert lebron['points'] == 27 and lebron['reboundsOff'] == 1 and lebron['reboundsDef'] == 7
    assert lebron['plusMinus'] == 6.0
    assert lebron['fieldGoalPct'] == 0.5 and lebron['threePointPct'] == 0.333
    assert lebron['trueShootingPct'] == round(27 / (2 * (20 + 0.44 * 6)), 4)
    assert lebron['effectiveFgPct'] == round((10 + 0.5 * 2) / 20, 4)
    assert lebron['dnp'] is False
    assert lebron['gameDate'] == datetime(2026, 10, 21)
    assert lebron['season'] == SEASON and lebron['seasonId'] == SEASON

    steph = by_key[('201939', '0022600001')]
    assert steph['homeAway'] == 'AWAY' and steph['result'] == 'L' and steph['plusMinus'] == -6.0

    dnp = by_key[('1630559', '0022600001')]
    assert dnp['dnp'] is True
    assert dnp['trueShootingPct'] is None and dnp['effectiveFgPct'] is None


def test_player_log_never_sets_started_or_advanced(player_df):
    rows = transform_player_game_log(player_df, SEASON, {'2544'}, {'0022600001'})
    assert 'started' not in PLAYER_LOG_COLUMNS
    for col in ('offRating', 'defRating', 'usageRate', 'pace', 'pir', 'dnpReason'):
        assert col not in PLAYER_LOG_COLUMNS
    for r in rows:
        assert set(PLAYER_LOG_COLUMNS) <= set(r)
        assert r['homeAway'] in ('HOME', 'AWAY') and r['result'] in ('W', 'L')


def test_player_log_empty():
    assert transform_player_game_log(pd.DataFrame(), SEASON, {'1'}, {'1'}) == []


def box_player(pid, team_id, position, minutes='PT30M00.00S'):
    return {
        'gameId': '0022600001', 'teamId': int(team_id), 'teamTricode': 'LAL',
        'personId': int(pid), 'firstName': 'F', 'familyName': 'L', 'position': position,
        'comment': '', 'jerseyNum': '0', 'minutes': minutes, 'points': 10,
    }


def test_extract_starter_ids():
    df = pd.DataFrame([
        box_player(2544, LAKERS_ID, 'F'),
        box_player(1629029, LAKERS_ID, 'G'),
        box_player(1630559, LAKERS_ID, 'G'),
        box_player(1626156, LAKERS_ID, 'F'),
        box_player(203076, LAKERS_ID, 'C'),
        box_player(1631108, LAKERS_ID, ''),
        box_player(1641731, LAKERS_ID, None),
        box_player(201939, WARRIORS_ID, 'G'),
        box_player(203110, WARRIORS_ID, ''),
    ])
    assert extract_starter_ids(df, LAKERS_ID) == {'2544', '1629029', '1630559', '1626156', '203076'}
    assert extract_starter_ids(df, int(WARRIORS_ID)) == {'201939'}
    assert len(extract_starter_ids(df)) == 6


def test_extract_starter_ids_bad_input():
    assert extract_starter_ids(None) == set()
    assert extract_starter_ids(pd.DataFrame()) == set()
    assert extract_starter_ids(pd.DataFrame([{'PLAYER_ID': 1, 'START_POSITION': 'F'}])) == set()
