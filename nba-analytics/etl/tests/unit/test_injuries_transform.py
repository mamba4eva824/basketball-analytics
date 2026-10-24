from datetime import datetime

from conftest import LAKERS_ID, CELTICS_ID, WARRIORS_ID, CLIPPERS_ID
from fetch_injuries import transform_injuries, normalize_name, INJURY_COLUMNS

FETCHED = datetime(2026, 10, 24, 12, 0)

TEAMS = [
    {'id': LAKERS_ID, 'name': 'Los Angeles Lakers', 'abbreviation': 'LAL'},
    {'id': CELTICS_ID, 'name': 'Boston Celtics', 'abbreviation': 'BOS'},
    {'id': WARRIORS_ID, 'name': 'Golden State Warriors', 'abbreviation': 'GSW'},
    {'id': CLIPPERS_ID, 'name': 'Los Angeles Clippers', 'abbreviation': 'LAC'},
]

PLAYERS = [
    {'id': '1629029', 'fullName': 'Luka Dončić', 'teamId': LAKERS_ID},
    {'id': '1630559', 'fullName': 'Austin Reaves', 'teamId': LAKERS_ID},
    {'id': '1627936', 'fullName': 'Jaren Jackson Jr.', 'teamId': '1610612763'},
    {'id': '201939', 'fullName': 'Stephen Curry', 'teamId': WARRIORS_ID},
    {'id': '1628369', 'fullName': 'Jayson Tatum', 'teamId': CELTICS_ID},
    {'id': '111', 'fullName': 'Chris Smith', 'teamId': CELTICS_ID},
    {'id': '222', 'fullName': 'Chris Smith', 'teamId': WARRIORS_ID},
]


def entry(name, abbr, status='Out', **kw):
    e = {
        'athlete': {'displayName': name, 'team': {'abbreviation': abbr}},
        'status': status,
        'date': '2026-10-20T18:31Z',
        'shortComment': f'{name} will miss time.',
        'longComment': 'Long comment.',
        'type': {'description': (status or '').lower()},
        'details': {'type': 'Knee', 'returnDate': '2026-11-01'},
    }
    e.update(kw)
    return e


PAYLOAD = {
    'injuries': [
        {'id': '13', 'displayName': 'Los Angeles Lakers', 'injuries': [
            entry('Luka Doncic', 'LAL'),
            entry('Austin Reaves', 'LAL', status='Day-To-Day', details={'type': 'Ankle'}),
            entry('Jaren Jackson Jr.', 'LAL', status='Questionable'),   # traded? league-wide match
            entry('Unknown Rookie', 'LAL'),
        ]},
        {'id': '9', 'displayName': 'Golden State Warriors', 'injuries': [
            entry('Stephen Curry', 'GS', date='2026-10-22T01:15:00Z'),
        ]},
        {'id': '12', 'displayName': 'LA Clippers', 'injuries': [         # name differs -> abbr fallback
            entry('Some Clipper', 'LAC'),
        ]},
        {'id': '2', 'displayName': 'Boston Celtics', 'injuries': [
            entry('Chris Smith', 'BOS'),                                  # same-team match wins
            {'athlete': None},                                             # junk entry
            'not-a-dict',
        ]},
        {'id': '99', 'displayName': 'Seattle SuperSonics', 'injuries': [entry('Ghost', 'SEA')]},
        'junk-group',
    ]
}


def rows_by_name():
    return {r['playerName']: r for r in transform_injuries(PAYLOAD, TEAMS, PLAYERS, fetched_at=FETCHED)}


def test_maps_teams_players_and_fields():
    rows = rows_by_name()
    assert set(rows) == {'Luka Doncic', 'Austin Reaves', 'Jaren Jackson Jr.', 'Unknown Rookie',
                         'Stephen Curry', 'Some Clipper', 'Chris Smith'}

    luka = rows['Luka Doncic']
    assert luka['teamId'] == LAKERS_ID
    assert luka['playerId'] == '1629029'           # accent-insensitive
    assert luka['source'] == 'espn'
    assert luka['status'] == 'Out'
    assert luka['injuryType'] == 'Knee'
    assert luka['detail'] == 'Luka Doncic will miss time.'
    assert luka['returnDate'] == datetime(2026, 11, 1)
    assert luka['reportedAt'] == datetime(2026, 10, 20, 18, 31)
    assert luka['fetchedAt'] == FETCHED
    assert luka['id'].startswith('c')
    assert set(INJURY_COLUMNS) <= set(luka)

    assert rows['Austin Reaves']['status'] == 'Day-To-Day'
    assert rows['Austin Reaves']['returnDate'] is None
    assert rows['Jaren Jackson Jr.']['playerId'] == '1627936'   # other team, unique name
    assert rows['Unknown Rookie']['playerId'] is None
    assert rows['Stephen Curry']['teamId'] == WARRIORS_ID
    assert rows['Stephen Curry']['reportedAt'] == datetime(2026, 10, 22, 1, 15)
    assert rows['Some Clipper']['teamId'] == CLIPPERS_ID
    assert rows['Chris Smith']['playerId'] == '111'


def test_abbreviation_mapping_when_name_missing():
    payload = {'injuries': [{'injuries': [entry('Stephen Curry', 'GS')]},
                            {'injuries': [entry('Nobody', 'WSH')]}]}
    rows = transform_injuries(payload, TEAMS + [{'id': '1610612764', 'name': 'Washington Wizards', 'abbreviation': 'WAS'}], PLAYERS)
    assert {r['teamId'] for r in rows} == {WARRIORS_ID, '1610612764'}


def test_ambiguous_league_wide_name_is_null():
    payload = {'injuries': [{'displayName': 'Los Angeles Lakers', 'injuries': [entry('Chris Smith', 'LAL')]}]}
    rows = transform_injuries(payload, TEAMS, PLAYERS)
    assert rows[0]['playerId'] is None


def test_status_fallback_and_dedupe():
    payload = {'injuries': [{'displayName': 'Los Angeles Lakers', 'injuries': [
        entry('Austin Reaves', 'LAL', status=None, type={'description': 'Out'}),
        entry('Austin Reaves', 'LAL', status=None, type={'description': 'Out'}),
    ]}]}
    rows = transform_injuries(payload, TEAMS, PLAYERS)
    assert len(rows) == 1
    assert rows[0]['status'] == 'Out'


def test_malformed_payloads_return_empty():
    for payload in (None, [], {}, {'injuries': None}, {'injuries': 'x'}, {'injuries': [{'injuries': 'x'}]}):
        assert transform_injuries(payload, TEAMS, PLAYERS) == []


def test_normalize_name():
    assert normalize_name('Luka Dončić') == 'luka doncic'
    assert normalize_name("D'Angelo Russell") == 'dangelo russell'
    assert normalize_name('Jaren Jackson Jr.') == 'jaren jackson'
    assert normalize_name('Gary Trent Jr') == 'gary trent'
    assert normalize_name('Marvin Bagley III') == 'marvin bagley'
    assert normalize_name('P.J. Washington') == 'pj washington'
    assert normalize_name('Karl-Anthony Towns') == 'karl anthony towns'
    assert normalize_name(None) == ''
