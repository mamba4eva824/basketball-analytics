"""
ETL Configuration — database connection, constants, season helpers.
"""

import os
import re
from datetime import date, datetime
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

# Load .env from project root
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# ── Database ──────────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/nba_analytics')

# ── NBA Constants ─────────────────────────────────────────────────────────────
LAKERS_TEAM_ID = '1610612747'

# ── Season derivation ────────────────────────────────────────────────────────
# A season "rolls over" on Oct 1: Oct–Dec belong to the season starting that
# year, Jan–Sep to the season that started the previous year.
# Override with NBA_SEASON=YYYY-YY (e.g. NBA_SEASON=2025-26).

SEASON_ROLLOVER_MONTH = 10
BACKFILL_SEASON_COUNT = 5


def season_from_start_year(start_year: int) -> str:
    """2026 -> '2026-27'."""
    return f"{start_year}-{(start_year + 1) % 100:02d}"


def season_start_year(season_str: str) -> int:
    """'2026-27' -> 2026."""
    return int(season_str[:4])


def season_for_date(d) -> str:
    """Season string for a date/datetime, e.g. 2026-10-24 -> '2026-27', 2026-09-30 -> '2025-26'."""
    start = d.year if d.month >= SEASON_ROLLOVER_MONTH else d.year - 1
    return season_from_start_year(start)


def previous_season(season_str: str) -> str:
    """'2026-27' -> '2025-26'."""
    return season_from_start_year(season_start_year(season_str) - 1)


def validate_season(season_str: str) -> str:
    """Return the season string if it looks like 'YYYY-YY' with consecutive years, else raise ValueError."""
    s = (season_str or '').strip()
    if not re.fullmatch(r'\d{4}-\d{2}', s) or season_from_start_year(int(s[:4])) != s:
        raise ValueError(f"Invalid season {season_str!r}; expected e.g. '2026-27'")
    return s


LEAGUE_TZ = ZoneInfo('America/New_York')


def league_today() -> date:
    """Today's date on the NBA's calendar (US Eastern) — must match src/lib/constants.ts."""
    return datetime.now(LEAGUE_TZ).date()


def resolve_current_season(today=None, env=None) -> str:
    """NBA_SEASON override if set, otherwise derived from today's date."""
    env = os.environ if env is None else env
    override = (env.get('NBA_SEASON') or '').strip()
    if override:
        return validate_season(override)
    return season_for_date(today or league_today())


def season_metadata(season_str: str, current_season: str = None) -> dict:
    """Season table row metadata: {startYear, endYear, isCurrent}."""
    start = season_start_year(season_str)
    return {
        'startYear': start,
        'endYear': start + 1,
        'isCurrent': season_str == (current_season or CURRENT_SEASON_YEAR),
    }


CURRENT_SEASON_YEAR = resolve_current_season()   # nba_api season string, e.g. '2026-27'
CURRENT_SEASON_ID = CURRENT_SEASON_YEAR           # Prisma Season.id
CURRENT_SEASON_START_YEAR = season_start_year(CURRENT_SEASON_YEAR)
CURRENT_SEASON_END_YEAR = CURRENT_SEASON_START_YEAR + 1
PREVIOUS_SEASON_YEAR = previous_season(CURRENT_SEASON_YEAR)

# Seasons to backfill: current + 4 previous, most recent first
BACKFILL_SEASONS = [
    season_from_start_year(CURRENT_SEASON_START_YEAR - i) for i in range(BACKFILL_SEASON_COUNT)
]

# Season metadata for Season table
SEASON_METADATA = {s: season_metadata(s, CURRENT_SEASON_YEAR) for s in BACKFILL_SEASONS}

# Team colors and division/conference mapping
# Conference and division for all 30 teams by abbreviation
TEAM_META = {
    'ATL': {'conference': 'EAST', 'division': 'SOUTHEAST', 'primary': '#E03A3E', 'secondary': '#C1D32F'},
    'BOS': {'conference': 'EAST', 'division': 'ATLANTIC', 'primary': '#007A33', 'secondary': '#BA9653'},
    'BKN': {'conference': 'EAST', 'division': 'ATLANTIC', 'primary': '#000000', 'secondary': '#FFFFFF'},
    'CHA': {'conference': 'EAST', 'division': 'SOUTHEAST', 'primary': '#1D1160', 'secondary': '#00788C'},
    'CHI': {'conference': 'EAST', 'division': 'CENTRAL', 'primary': '#CE1141', 'secondary': '#000000'},
    'CLE': {'conference': 'EAST', 'division': 'CENTRAL', 'primary': '#860038', 'secondary': '#041E42'},
    'DAL': {'conference': 'WEST', 'division': 'SOUTHWEST', 'primary': '#00538C', 'secondary': '#002B5E'},
    'DEN': {'conference': 'WEST', 'division': 'NORTHWEST', 'primary': '#0E2240', 'secondary': '#FEC524'},
    'DET': {'conference': 'EAST', 'division': 'CENTRAL', 'primary': '#C8102E', 'secondary': '#1D42BA'},
    'GSW': {'conference': 'WEST', 'division': 'PACIFIC', 'primary': '#1D428A', 'secondary': '#FFC72C'},
    'HOU': {'conference': 'WEST', 'division': 'SOUTHWEST', 'primary': '#CE1141', 'secondary': '#000000'},
    'IND': {'conference': 'EAST', 'division': 'CENTRAL', 'primary': '#002D62', 'secondary': '#FDBB30'},
    'LAC': {'conference': 'WEST', 'division': 'PACIFIC', 'primary': '#C8102E', 'secondary': '#1D428A'},
    'LAL': {'conference': 'WEST', 'division': 'PACIFIC', 'primary': '#552583', 'secondary': '#FDB927'},
    'MEM': {'conference': 'WEST', 'division': 'SOUTHWEST', 'primary': '#5D76A9', 'secondary': '#12173F'},
    'MIA': {'conference': 'EAST', 'division': 'SOUTHEAST', 'primary': '#98002E', 'secondary': '#F9A01B'},
    'MIL': {'conference': 'EAST', 'division': 'CENTRAL', 'primary': '#00471B', 'secondary': '#EEE1C6'},
    'MIN': {'conference': 'WEST', 'division': 'NORTHWEST', 'primary': '#0C2340', 'secondary': '#236192'},
    'NOP': {'conference': 'WEST', 'division': 'SOUTHWEST', 'primary': '#0C2340', 'secondary': '#C8102E'},
    'NYK': {'conference': 'EAST', 'division': 'ATLANTIC', 'primary': '#006BB6', 'secondary': '#F58426'},
    'OKC': {'conference': 'WEST', 'division': 'NORTHWEST', 'primary': '#007AC1', 'secondary': '#EF6C00'},
    'ORL': {'conference': 'EAST', 'division': 'SOUTHEAST', 'primary': '#0077C0', 'secondary': '#C4CED4'},
    'PHI': {'conference': 'EAST', 'division': 'ATLANTIC', 'primary': '#006BB6', 'secondary': '#ED174C'},
    'PHX': {'conference': 'WEST', 'division': 'PACIFIC', 'primary': '#1D1160', 'secondary': '#E56020'},
    'POR': {'conference': 'WEST', 'division': 'NORTHWEST', 'primary': '#E03A3E', 'secondary': '#000000'},
    'SAC': {'conference': 'WEST', 'division': 'PACIFIC', 'primary': '#5A2D81', 'secondary': '#63727A'},
    'SAS': {'conference': 'WEST', 'division': 'SOUTHWEST', 'primary': '#C4CED4', 'secondary': '#000000'},
    'TOR': {'conference': 'EAST', 'division': 'ATLANTIC', 'primary': '#CE1141', 'secondary': '#000000'},
    'UTA': {'conference': 'WEST', 'division': 'NORTHWEST', 'primary': '#002B5C', 'secondary': '#00471B'},
    'WAS': {'conference': 'EAST', 'division': 'SOUTHEAST', 'primary': '#002B5C', 'secondary': '#E31837'},
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def season_to_nba_api(season_str: str) -> str:
    """Convert '2025-26' to '2025-26' (nba_api uses the same format for most endpoints)."""
    return season_str


def season_to_season_id(season_str: str) -> str:
    """Season ID matches the season string in our schema: e.g. '2025-26'."""
    return season_str


def season_display_name(season_str: str) -> str:
    """e.g. '2025-26 Season'."""
    return f"{season_str} Season"
