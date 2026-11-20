import contextlib
from datetime import datetime

import pytest

from conftest import LAKERS_ID
from fetch_lineup_games import LINEUP_GAME_COLUMNS, games_to_fetch, nba_date, transform_game_on_off
from test_lineup_groups_transform import AR, LUKA, on_off_frames

SEASON = '2026-27'
DAY = datetime(2026, 11, 8)


def one_game_frames(opp=False, team_minutes=48.0):
    frames = on_off_frames(opp)
    frames[0] = frames[0].assign(MIN=team_minutes)
    return frames


def test_games_to_fetch_skips_loaded_and_sorts_oldest_first():
    games = [{'gameId': 'c', 'gameDate': datetime(2026, 11, 3)}, {'gameId': 'a', 'gameDate': datetime(2026, 10, 22)},
             {'gameId': 'b', 'gameDate': datetime(2026, 10, 25)}]
    assert [g['gameId'] for g in games_to_fetch(games, ['b'], today=datetime(2026, 11, 20))] == ['a', 'c']


def test_games_to_fetch_refetches_recent_loaded_games():
    games = [{'gameId': 'old', 'gameDate': datetime(2026, 11, 10)}, {'gameId': 'recent', 'gameDate': datetime(2026, 11, 18)}]
    todo = games_to_fetch(games, ['old', 'recent'], today=datetime(2026, 11, 20))
    assert [g['gameId'] for g in todo] == ['recent']


def test_nba_date_format():
    assert nba_date(DAY) == '11/08/2026'


def test_game_rows_carry_the_game_and_match_the_table():
    rows = transform_game_on_off(one_game_frames(), one_game_frames(opp=True), LAKERS_ID, SEASON, '0022600150', DAY)
    assert {r['groupKey'] for r in rows} == {'', LUKA, AR}
    assert all(r['gameId'] == '0022600150' and r['gameDate'] == DAY for r in rows)
    assert all('gamesPlayed' not in r for r in rows)
    assert all(set(r) <= set(LINEUP_GAME_COLUMNS) for r in rows)
    assert len({r['id'] for r in rows}) == len(rows)
    assert next(r for r in rows if r['groupKey'] == LUKA)['minutes'] == 300.0


def test_incomplete_game_is_not_written():
    assert transform_game_on_off(one_game_frames(team_minutes=30.0), None, LAKERS_ID, SEASON, 'g', DAY) == []
    assert transform_game_on_off([], None, LAKERS_ID, SEASON, 'g', DAY) == []


def test_overtime_game_is_kept():
    rows = transform_game_on_off(one_game_frames(team_minutes=53.0), None, LAKERS_ID, SEASON, 'g', DAY)
    assert rows and all(r['oppPts'] is None for r in rows)


def test_failed_game_is_skipped_others_written_then_step_fails(monkeypatch):
    import fetch_lineup_games as m

    games = [{'gameId': 'g1', 'gameDate': datetime(2026, 10, 22)}, {'gameId': 'g2', 'gameDate': datetime(2026, 10, 24)}]
    deletes, upserts, calls = [], [], []

    @contextlib.contextmanager
    def fake_db():
        yield 'session'

    def fake_safe_call(endpoint, **kw):
        calls.append((kw['date_from_nullable'], kw['measure_type_detailed_defense']))
        if kw['date_from_nullable'] == '10/22/2026':
            raise RuntimeError('timeout')
        return one_game_frames(opp=kw['measure_type_detailed_defense'] == 'Opponent')

    monkeypatch.setattr(m, 'get_db', fake_db)
    monkeypatch.setattr(m, '_load_games', lambda session, t, s: (games, []))
    monkeypatch.setattr(m, 'games_to_fetch', lambda games, loaded: sorted(games, key=lambda g: g['gameDate']))
    monkeypatch.setattr(m, 'safe_call', fake_safe_call)
    monkeypatch.setattr(m, 'execute_sql', lambda session, q, params: deletes.append(params))
    monkeypatch.setattr(m, 'upsert_rows', lambda session, table, rows, *a, **k: upserts.append((table, rows)))
    with pytest.raises(RuntimeError, match='g1'):
        m.fetch_lineup_games(SEASON, LAKERS_ID)
    assert deletes == [{'t': LAKERS_ID, 'g': 'g2'}]
    assert upserts[0][0] == 'LineupGroupGameStats' and {r['gameId'] for r in upserts[0][1]} == {'g2'}
    assert calls == [('10/22/2026', 'Base'), ('10/24/2026', 'Base'), ('10/24/2026', 'Opponent')]


def test_failed_opponent_call_skips_the_game_for_retry(monkeypatch):
    import fetch_lineup_games as m

    games = [{'gameId': 'g1', 'gameDate': datetime(2026, 10, 22)}]
    upserts = []

    @contextlib.contextmanager
    def fake_db():
        yield 'session'

    def fake_safe_call(endpoint, **kw):
        if kw['measure_type_detailed_defense'] == 'Opponent':
            raise RuntimeError('timeout')
        return one_game_frames()

    monkeypatch.setattr(m, 'get_db', fake_db)
    monkeypatch.setattr(m, '_load_games', lambda session, t, s: (games, []))
    monkeypatch.setattr(m, 'safe_call', fake_safe_call)
    monkeypatch.setattr(m, 'execute_sql', lambda *a, **k: None)
    monkeypatch.setattr(m, 'upsert_rows', lambda session, table, rows, *a, **k: upserts.append(rows))
    with pytest.raises(RuntimeError, match='g1'):
        m.fetch_lineup_games(SEASON, LAKERS_ID)
    assert upserts == []
