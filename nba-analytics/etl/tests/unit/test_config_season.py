import importlib
from datetime import date, datetime

import pytest

import config


@pytest.mark.parametrize('d, expected', [
    (date(2026, 9, 30), '2025-26'),
    (date(2026, 10, 1), '2026-27'),
    (date(2026, 10, 24), '2026-27'),
    (date(2026, 12, 31), '2026-27'),
    (date(2027, 1, 15), '2026-27'),
    (date(2027, 6, 20), '2026-27'),
    (datetime(2099, 11, 2, 12, 0), '2099-00'),
])
def test_season_for_date(d, expected):
    assert config.season_for_date(d) == expected


def test_resolve_current_season_from_date():
    assert config.resolve_current_season(today=date(2026, 9, 30), env={}) == '2025-26'
    assert config.resolve_current_season(today=date(2026, 10, 1), env={}) == '2026-27'
    assert config.resolve_current_season(today=date(2027, 1, 5), env={}) == '2026-27'


def test_resolve_current_season_env_override():
    assert config.resolve_current_season(today=date(2026, 10, 24), env={'NBA_SEASON': '2025-26'}) == '2025-26'
    assert config.resolve_current_season(today=date(2026, 10, 24), env={'NBA_SEASON': '  '}) == '2026-27'
    with pytest.raises(ValueError):
        config.resolve_current_season(env={'NBA_SEASON': '2025-27'})
    with pytest.raises(ValueError):
        config.resolve_current_season(env={'NBA_SEASON': '2025'})


def test_previous_season_and_helpers():
    assert config.previous_season('2026-27') == '2025-26'
    assert config.previous_season('2000-01') == '1999-00'
    assert config.season_from_start_year(1999) == '1999-00'
    assert config.season_start_year('2026-27') == 2026
    assert config.season_metadata('2025-26', '2026-27') == {'startYear': 2025, 'endYear': 2026, 'isCurrent': False}
    assert config.season_metadata('2026-27', '2026-27')['isCurrent'] is True


@pytest.fixture
def reload_config(monkeypatch):
    def _reload(nba_season):
        if nba_season is None:
            monkeypatch.delenv('NBA_SEASON', raising=False)
        else:
            monkeypatch.setenv('NBA_SEASON', nba_season)
        return importlib.reload(config)
    yield _reload
    monkeypatch.delenv('NBA_SEASON', raising=False)
    importlib.reload(config)


def test_module_constants_with_override(reload_config):
    c = reload_config('2025-26')
    assert c.CURRENT_SEASON_YEAR == '2025-26'
    assert c.CURRENT_SEASON_ID == '2025-26'
    assert c.CURRENT_SEASON_START_YEAR == 2025
    assert c.CURRENT_SEASON_END_YEAR == 2026
    assert c.PREVIOUS_SEASON_YEAR == '2024-25'
    assert c.BACKFILL_SEASONS == ['2025-26', '2024-25', '2023-24', '2022-23', '2021-22']
    assert list(c.SEASON_METADATA) == c.BACKFILL_SEASONS
    assert [s for s, m in c.SEASON_METADATA.items() if m['isCurrent']] == ['2025-26']
    assert c.SEASON_METADATA['2021-22'] == {'startYear': 2021, 'endYear': 2022, 'isCurrent': False}


def test_backfill_has_no_duplicates(reload_config):
    c = reload_config(None)
    assert len(c.BACKFILL_SEASONS) == 5
    assert len(set(c.BACKFILL_SEASONS)) == 5
    assert c.BACKFILL_SEASONS[0] == c.CURRENT_SEASON_YEAR
    assert c.BACKFILL_SEASONS[1] == c.PREVIOUS_SEASON_YEAR
    assert c.CURRENT_SEASON_YEAR == c.season_for_date(date.today())
