import pytest

import refresh


def test_count_normalizes_return_values():
    assert refresh._count(None) == 0
    assert refresh._count(7) == 7
    assert refresh._count([1, 2, 3]) == 3
    assert refresh._count(([1, 2], [3])) == 3


def test_build_steps_order_and_flags():
    steps = refresh.build_steps('2026-27', '1610612747', skip_schedule=True, skip_injuries=True)
    names = [s[0] for s in steps]
    assert names == [
        'Teams + seasons', 'Rosters', 'Schedule', 'Team games', 'Player games', 'Starters',
        'Player seasons', 'Team seasons + standings', 'Lineups', 'Injuries',
    ]
    skipped = {s[0] for s in steps if s[3]}
    assert skipped == {'Schedule', 'Injuries'}
    optional = {s[0] for s in steps if s[2]}
    assert optional == {'Injuries'}


def test_run_steps_isolates_failures(capsys):
    calls = []

    def ok():
        calls.append('ok')
        return [1, 2]

    def boom():
        calls.append('boom')
        raise RuntimeError('stats.nba.com timeout')

    def after():
        calls.append('after')
        return 0

    results = refresh.run_steps([
        ('A', ok, False, False),
        ('B', boom, False, False),
        ('C', after, False, False),
        ('D', ok, True, True),
    ])
    assert calls == ['ok', 'boom', 'after']
    assert [(r[0], r[1], r[2]) for r in results] == [
        ('A', 'ok', 2), ('B', 'failed', 0), ('C', 'empty', 0), ('D', 'skipped', 0),
    ]


def test_main_exit_code(monkeypatch):
    def fake_steps(*a, **k):
        return [('Required', lambda: (_ for _ in ()).throw(RuntimeError('x')), False, False)]
    monkeypatch.setattr(refresh, 'build_steps', fake_steps)
    assert refresh.main([]) == 1

    def optional_fail(*a, **k):
        return [('Opt', lambda: (_ for _ in ()).throw(RuntimeError('x')), True, False),
                ('Req', lambda: 3, False, False)]
    monkeypatch.setattr(refresh, 'build_steps', optional_fail)
    assert refresh.main([]) == 0


def test_main_rejects_bad_args():
    with pytest.raises(SystemExit):
        refresh.main(['--season', '2026-28'])
    with pytest.raises(SystemExit):
        refresh.main(['--team-focus', 'XXX'])
