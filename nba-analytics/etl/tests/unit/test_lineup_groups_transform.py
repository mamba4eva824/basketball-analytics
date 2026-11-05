import pandas as pd

from conftest import LAKERS_ID
from fetch_lineup_groups import (
    LINEUP_GROUP_COLUMNS, overall_frame, on_court_frame, parse_group_id,
    transform_lineup_groups, transform_on_off,
)

SEASON = '2026-27'
LUKA, AR, KESSLER = '1629029', '1630559', '1631117'


def base_row(group_id=None, **kw):
    row = {
        'GROUP_SET': 'Lineups', 'GROUP_ID': group_id, 'GROUP_NAME': 'x', 'GP': 10, 'W': 7, 'L': 3,
        'MIN': 123.45, 'FGM': 50, 'FGA': 100, 'FG3M': 15, 'FG3A': 40, 'FTM': 20, 'FTA': 25,
        'OREB': 12, 'DREB': 40, 'REB': 52, 'AST': 30, 'TOV': 14, 'STL': 8, 'BLK': 5,
        'PTS': 135, 'PLUS_MINUS': 12.0,
    }
    row.update(kw)
    return row


def opp_row(group_id=None, **kw):
    row = {
        'GROUP_SET': 'Lineups', 'GROUP_ID': group_id, 'GP': 10, 'MIN': 123.45,
        'OPP_FGM': 45, 'OPP_FGA': 98, 'OPP_FG3M': 11, 'OPP_FG3A': 35, 'OPP_FTM': 22, 'OPP_FTA': 28,
        'OPP_OREB': 10, 'OPP_DREB': 38, 'OPP_TOV': 16, 'OPP_PTS': 123, 'PLUS_MINUS': 12.0,
    }
    row.update(kw)
    return row


def test_parse_group_id_sorts_like_the_app():
    assert parse_group_id(f'-{LUKA}-{AR}-{KESSLER}-') == sorted([LUKA, AR, KESSLER])
    assert parse_group_id(' -2544 - 203076- ') == ['203076', '2544']  # string sort, as JS [].sort()
    assert parse_group_id(None) == [] and parse_group_id(float('nan')) == []


def test_groups_join_base_and_opponent_by_group():
    gid = f'-{LUKA}-{KESSLER}-'
    rows = transform_lineup_groups(
        pd.DataFrame([base_row(gid), base_row(f'-{LUKA}-{AR}-{KESSLER}-')]),  # wrong size: dropped
        pd.DataFrame([opp_row(gid)]),
        LAKERS_ID, SEASON, 2,
    )
    assert len(rows) == 1
    r = rows[0]
    assert r['groupKey'] == '-'.join(sorted([LUKA, KESSLER])) and r['groupSize'] == 2
    assert r['teamId'] == LAKERS_ID and r['season'] == SEASON and r['seasonId'] == SEASON
    assert r['minutes'] == 123.45 and r['gamesPlayed'] == 10
    assert (r['pts'], r['fga'], r['oreb'], r['tov'], r['plusMinus']) == (135, 100, 12, 14, 12)
    assert (r['oppPts'], r['oppFga'], r['oppDreb'], r['oppTov']) == (123, 98, 38, 16)
    assert set(LINEUP_GROUP_COLUMNS) <= set(r)


def test_missing_opponent_columns_leave_all_opponent_fields_null():
    gid = f'-{LUKA}-{KESSLER}-'
    partial = opp_row(gid)
    del partial['OPP_TOV']
    for opp in (None, pd.DataFrame([partial])):
        r = transform_lineup_groups(pd.DataFrame([base_row(gid)]), opp, LAKERS_ID, SEASON, 2)[0]
        assert r['oppPts'] is None and r['oppTov'] is None and r['oppFga'] is None
        assert r['pts'] == 135  # team side still loads


def test_empty_frames():
    assert transform_lineup_groups(None, None, LAKERS_ID, SEASON, 3) == []
    assert transform_lineup_groups(pd.DataFrame(), None, LAKERS_ID, SEASON, 3) == []


def on_off_frames(opp=False):
    stat = opp_row if opp else base_row
    overall = pd.DataFrame([{**stat(), 'GROUP_VALUE': 'Los Angeles Lakers', 'TEAM_ID': int(LAKERS_ID), 'MIN': 480.0}])
    players = []
    for pid, status, mins in [(LUKA, 'On', 300.0), (LUKA, 'Off', 180.0), (AR, 'On', 320.5)]:
        players.append({**stat(), 'TEAM_ID': int(LAKERS_ID), 'VS_PLAYER_ID': int(pid), 'VS_PLAYER_NAME': pid, 'COURT_STATUS': status, 'MIN': mins})
    df = pd.DataFrame(players)
    return [overall, df[df['COURT_STATUS'] == 'On'], df[df['COURT_STATUS'] == 'Off']]


def test_on_off_frames_are_picked_by_shape():
    frames = on_off_frames()
    assert overall_frame(frames) is frames[0]
    on = on_court_frame(frames)
    assert list(on['COURT_STATUS'].unique()) == ['On']


def test_on_off_gives_team_and_player_on_court_rows():
    rows = transform_on_off(on_off_frames(), on_off_frames(opp=True), LAKERS_ID, SEASON)
    team = [r for r in rows if r['groupSize'] == 0]
    players = {r['groupKey']: r for r in rows if r['groupSize'] == 1}
    assert len(team) == 1 and team[0]['groupKey'] == '' and team[0]['minutes'] == 480.0
    assert team[0]['oppPts'] == 123
    assert set(players) == {LUKA, AR}
    assert players[LUKA]['minutes'] == 300.0  # the "On" row, not "Off"
    assert players[AR]['oppFga'] == 98


def test_on_off_without_opponent_call():
    rows = transform_on_off(on_off_frames(), None, LAKERS_ID, SEASON)
    assert rows and all(r['oppPts'] is None for r in rows)
