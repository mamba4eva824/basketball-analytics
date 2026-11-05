import contextlib

import pandas as pd
import pytest

from conftest import LAKERS_ID, WARRIORS_ID
import fetch_player_advanced as m
from fetch_player_advanced import ADVANCED_FIELDS, played, player_stats_frame, transform_player_advanced

GAME = '0022600005'


def prow(pid, team, minutes, **kw):
    row = {
        'gameId': GAME, 'teamId': int(team), 'personId': pid, 'minutes': minutes,
        'offensiveRating': 120.4, 'defensiveRating': 108.1, 'netRating': 12.3, 'pace': 101.5,
        'usagePercentage': 0.312, 'assistPercentage': 0.401, 'reboundPercentage': 0.12,
        'trueShootingPercentage': 0.645, 'effectiveFieldGoalPercentage': 0.58, 'PIE': 0.21,
    }
    row.update(kw)
    return row


def frame(*rows):
    return pd.DataFrame(list(rows))


def test_played_parses_v3_minutes():
    assert played('34:12') and played('0:30') and played('05:00')
    assert played('PT34M12.00S') and played('PT00M04.00S') and played(12.5)  # ISO duration, numeric
    assert not played('') and not played(None) and not played('0:00') and not played('00:00')
    assert not played(float('nan')) and not played('PT00M00.00S') and not played(0)


def test_transform_keeps_players_who_played_with_decimal_percentages():
    rows = transform_player_advanced(frame(
        prow(1629029, LAKERS_ID, '35:10'),
        prow(1630559, LAKERS_ID, '', usagePercentage=0.0),  # DNP
        prow(201939, WARRIORS_ID, '31:00', usagePercentage=28.4),  # whole-number percentage
    ))
    assert [r['playerId'] for r in rows] == ['1629029', '201939']
    luka = rows[0]
    assert luka['gameId'] == GAME and luka['teamId'] == LAKERS_ID
    assert luka['usageRate'] == 0.312 and luka['offRating'] == 120.4 and luka['netRating'] == 12.3
    assert luka['trueShootingPct'] == 0.645 and luka['effectiveFgPct'] == 0.58
    assert rows[1]['usageRate'] == 0.284 and rows[1]['teamId'] == WARRIORS_ID
    assert set(ADVANCED_FIELDS) <= set(luka)
    # never writes PIE into the PIR column, never touches started
    assert 'pir' not in luka and 'started' not in luka


def test_transform_pads_game_ids_and_handles_empty():
    rows = transform_player_advanced(frame(prow(1629029, LAKERS_ID, '10:00', gameId=22600005)))
    assert rows[0]['gameId'] == GAME
    assert transform_player_advanced(None) == [] and transform_player_advanced(pd.DataFrame()) == []


def test_picks_the_player_stats_frame():
    team = pd.DataFrame([{'gameId': GAME, 'teamId': 1, 'usagePercentage': 1.0}])
    players = frame(prow(1, LAKERS_ID, '1:00'))
    assert player_stats_frame([team, players]) is players


def _fake_db(updates, game_ids):
    class Result:
        def __init__(self, rows=None, rowcount=1):
            self._rows, self.rowcount = rows or [], rowcount

        def __iter__(self):
            return iter(self._rows)

    class Session:
        def execute(self, stmt, params=None):
            if 'SELECT g."gameId"' in str(stmt):
                return Result([(g,) for g in game_ids])
            updates.append(params)
            return Result()

    @contextlib.contextmanager
    def db():
        yield Session()
    return db


def test_fetch_updates_both_teams_and_retries_failures(monkeypatch):
    updates = []
    monkeypatch.setattr(m, 'get_db', _fake_db(updates, ['G1', 'G2']))

    def fake_call(endpoint, game_id):
        if game_id == 'G2':
            raise RuntimeError('timeout')
        return [frame(prow(1629029, LAKERS_ID, '30:00', gameId='G1'), prow(201939, WARRIORS_ID, '28:00', gameId='G1'))]

    monkeypatch.setattr(m, 'safe_call', fake_call)
    assert m.fetch_focus_team_player_advanced('2026-27', LAKERS_ID) == 2
    assert {(u['playerId'], u['teamId']) for u in updates} == {('1629029', LAKERS_ID), ('201939', WARRIORS_ID)}


def test_unpublished_box_score_is_retried_not_a_failure(monkeypatch):
    monkeypatch.setattr(m, 'get_db', _fake_db([], ['G1']))
    monkeypatch.setattr(m, 'safe_call', lambda endpoint, game_id: [pd.DataFrame(columns=['personId', 'usagePercentage'])])
    assert m.fetch_focus_team_player_advanced('2026-27', LAKERS_ID) == 0  # no raise


def test_old_v2_enrichment_delegates_to_the_v3_step(monkeypatch):
    import fetch_advanced
    calls = []
    monkeypatch.setattr(m, 'fetch_focus_team_player_advanced', lambda season, team: calls.append((season, team)))
    fetch_advanced.enrich_player_game_logs_advanced(['2026-27'], [LAKERS_ID, WARRIORS_ID])
    assert calls == [('2026-27', LAKERS_ID), ('2026-27', WARRIORS_ID)]


def test_fetch_raises_when_every_game_fails(monkeypatch):
    monkeypatch.setattr(m, 'get_db', _fake_db([], ['G1']))
    monkeypatch.setattr(m, 'safe_call', lambda endpoint, game_id: (_ for _ in ()).throw(RuntimeError('blocked')))
    with pytest.raises(RuntimeError, match='All 1'):
        m.fetch_focus_team_player_advanced('2026-27', LAKERS_ID)
