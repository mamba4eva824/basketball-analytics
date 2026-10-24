from datetime import datetime

import pandas as pd

from conftest import LAKERS_ID, CELTICS_ID, WARRIORS_ID
from fetch_schedule import transform_schedule, normalize_game_id, parse_utc_datetime

SEASON = '2026-27'
KNOWN = {LAKERS_ID, CELTICS_ID, WARRIORS_ID}


def game(game_id, home, away, status=1, home_score=0, away_score=0, **extra):
    row = {
        'leagueId': '00',
        'seasonYear': '2026-27',
        'gameDate': '10/27/2026 00:00:00',
        'gameId': game_id,
        'gameStatus': status,
        'gameStatusText': 'Final' if status == 3 else '7:30 pm ET',
        'gameDateEst': '2026-10-27T00:00:00Z',
        'gameDateTimeEst': '2026-10-27T22:00:00Z',
        'gameDateUTC': '2026-10-27T04:00:00Z',
        'gameDateTimeUTC': '2026-10-28T02:00:00Z',
        'gameLabel': '',
        'arenaName': 'Crypto.com Arena',
        'arenaCity': 'Los Angeles',
        'homeTeam_teamId': int(home),
        'homeTeam_score': home_score,
        'awayTeam_teamId': int(away),
        'awayTeam_score': away_score,
        'nationalBroadcasters_0_broadcasterDisplay': None,
        'nationalBroadcasters_1_broadcasterDisplay': None,
    }
    row.update(extra)
    return row


def frame(*rows):
    return pd.DataFrame(list(rows))


def by_id(rows):
    return {r['gameId']: r for r in rows}


def test_future_game_late_et_crosses_utc_midnight():
    rows = transform_schedule(frame(game('0022600050', LAKERS_ID, CELTICS_ID)), SEASON, KNOWN)
    assert len(rows) == 1
    r = rows[0]
    assert r['gameId'] == '0022600050'
    assert r['season'] == SEASON and r['seasonId'] == SEASON
    assert r['gameDateUtc'] == datetime(2026, 10, 28, 2, 0)
    assert r['gameDateUtc'].tzinfo is None
    assert r['gameDateEt'] == '2026-10-27'
    assert r['status'] == 1
    assert r['statusText'] == '7:30 pm ET'
    assert r['homeTeamId'] == LAKERS_ID and r['awayTeamId'] == CELTICS_ID
    assert r['homeScore'] is None and r['awayScore'] is None
    assert r['arena'] == 'Crypto.com Arena' and r['arenaCity'] == 'Los Angeles'
    assert r['nationalTv'] is None
    assert r['gameLabel'] is None
    assert r['isPlayoff'] is False
    assert r['createdAt'] is not None and r['updatedAt'] is not None


def test_final_game_keeps_scores_live_game_does_not():
    rows = by_id(transform_schedule(frame(
        game('0022600001', LAKERS_ID, WARRIORS_ID, status=3, home_score=112, away_score=108),
        game('0022600002', CELTICS_ID, LAKERS_ID, status=2, home_score=50, away_score=48),
    ), SEASON, KNOWN))
    assert rows['0022600001']['homeScore'] == 112
    assert rows['0022600001']['awayScore'] == 108
    assert rows['0022600001']['statusText'] == 'Final'
    assert rows['0022600002']['homeScore'] is None
    assert rows['0022600002']['awayScore'] is None


def test_filters_game_types():
    rows = by_id(transform_schedule(frame(
        game('0012600001', LAKERS_ID, CELTICS_ID),                       # preseason
        game('0022600003', LAKERS_ID, CELTICS_ID),                       # regular season
        game('0032600001', LAKERS_ID, CELTICS_ID),                       # all-star
        game('0042600101', LAKERS_ID, CELTICS_ID, seriesGameNumber='Game 1'),  # playoffs
        game('0052600101', LAKERS_ID, CELTICS_ID, gameLabel='SoFi Play-In Tournament'),
        game('0062600001', LAKERS_ID, CELTICS_ID, gameLabel='Emirates NBA Cup'),  # Cup final
    ), SEASON, KNOWN))
    assert set(rows) == {'0022600003', '0042600101', '0052600101', '0062600001'}
    assert rows['0042600101']['isPlayoff'] is True
    assert rows['0022600003']['isPlayoff'] is False
    assert rows['0052600101']['isPlayoff'] is False
    assert rows['0062600001']['isPlayoff'] is False
    assert rows['0062600001']['gameLabel'] == 'Emirates NBA Cup'


def test_skips_tbd_and_unknown_teams():
    rows = transform_schedule(frame(
        game('0042600201', 0, 0),                     # TBD playoff slot
        game('0042600202', LAKERS_ID, 0),
        game('0022600004', LAKERS_ID, 1610612737),    # ATL not in known set
        game('0022600005', LAKERS_ID, CELTICS_ID),
    ), SEASON, KNOWN)
    assert [r['gameId'] for r in rows] == ['0022600005']


def test_no_known_team_filter_when_none():
    rows = transform_schedule(frame(game('0022600004', LAKERS_ID, 1610612737)), SEASON)
    assert len(rows) == 1


def test_national_tv_joins_enumerated_broadcasters():
    rows = transform_schedule(frame(game(
        '0022600006', LAKERS_ID, CELTICS_ID,
        nationalBroadcasters_0_broadcasterDisplay='NBC',
        nationalBroadcasters_1_broadcasterDisplay='Peacock',
    )), SEASON, KNOWN)
    assert rows[0]['nationalTv'] == 'NBC / Peacock'


def test_national_tv_single_column_variant():
    g = game('0022600007', LAKERS_ID, CELTICS_ID)
    del g['nationalBroadcasters_0_broadcasterDisplay']
    del g['nationalBroadcasters_1_broadcasterDisplay']
    g['nationalBroadcasters_broadcasterDisplay'] = 'ESPN'
    g['homeTvBroadcasters_broadcasterDisplay'] = 'Spectrum SportsNet'
    rows = transform_schedule(frame(g), SEASON, KNOWN)
    assert rows[0]['nationalTv'] == 'ESPN'


def test_et_date_fallbacks_and_missing_dates():
    g1 = game('0022600008', LAKERS_ID, CELTICS_ID, gameDateEst=None)
    g2 = game('0022600009', LAKERS_ID, CELTICS_ID, gameDateEst=None, gameDateTimeEst=None)
    g3 = game('0022600010', LAKERS_ID, CELTICS_ID, gameDateTimeUTC=None)
    g4 = game('0022600011', LAKERS_ID, CELTICS_ID, gameDateTimeUTC=None, gameDateUTC=None)
    rows = by_id(transform_schedule(frame(g1, g2, g3, g4), SEASON, KNOWN))
    assert rows['0022600008']['gameDateEt'] == '2026-10-27'
    assert rows['0022600009']['gameDateEt'] == '2026-10-27'   # from gameDate 10/27/2026
    assert rows['0022600010']['gameDateUtc'] == datetime(2026, 10, 27, 4, 0)
    assert '0022600011' not in rows


def test_empty_frame():
    assert transform_schedule(pd.DataFrame(), SEASON) == []
    assert transform_schedule(None, SEASON) == []


def test_helpers():
    assert normalize_game_id(22600001) == '0022600001'
    assert normalize_game_id('0022600001') == '0022600001'
    assert normalize_game_id(None) is None
    assert parse_utc_datetime('2026-10-28T02:00:00Z') == datetime(2026, 10, 28, 2, 0)
    assert parse_utc_datetime('garbage') is None
