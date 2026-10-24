"""
Fetch the league injury report from ESPN's public (unofficial) site API.
Populates: PlayerInjury (all rows for source='espn' are replaced on each fetch).

Optional source: any failure is logged and swallowed so the rest of the ETL is unaffected.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import re
import unicodedata
from datetime import datetime, timezone

import requests

from utils import get_db, generate_cuid

from sqlalchemy import text


ESPN_INJURIES_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries'
SOURCE = 'espn'
REQUEST_TIMEOUT = 15

# ESPN abbreviations that differ from NBA.com's
ESPN_ABBR_MAP = {
    'GS': 'GSW',
    'NY': 'NYK',
    'SA': 'SAS',
    'NO': 'NOP',
    'UTAH': 'UTA',
    'WSH': 'WAS',
}

_NAME_SUFFIXES = {'jr', 'sr', 'ii', 'iii', 'iv', 'v'}

INJURY_COLUMNS = [
    'id', 'source', 'teamId', 'playerId', 'playerName', 'status',
    'injuryType', 'detail', 'returnDate', 'reportedAt', 'fetchedAt',
]


def normalize_name(name):
    """'Luka Dončić' -> 'luka doncic'; "D'Angelo Russell" -> 'dangelo russell'; drops Jr/Sr/II/III."""
    if not name:
        return ''
    s = unicodedata.normalize('NFKD', str(name))
    s = ''.join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r"[.'’`]", '', s)
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    tokens = [t for t in s.split() if t not in _NAME_SUFFIXES]
    return ' '.join(tokens)


def _get(d, *keys):
    """Nested dict .get that tolerates non-dict intermediates."""
    for k in keys:
        if not isinstance(d, dict):
            return None
        d = d.get(k)
    return d


def _clean(val):
    if val is None:
        return None
    s = str(val).strip()
    return s or None


def _parse_dt(val):
    """ISO date/datetime ('2026-11-01', '2026-10-20T18:31Z') -> naive UTC datetime, or None."""
    s = _clean(val)
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace('Z', '+00:00'))
    except ValueError:
        try:
            dt = datetime.strptime(s[:10], '%Y-%m-%d')
        except ValueError:
            return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def transform_injuries(payload, teams, players, fetched_at=None):
    """
    Map an ESPN injuries payload to PlayerInjury rows.

    teams:   iterable of {'id', 'name', 'abbreviation'} (Team table)
    players: iterable of {'id', 'fullName', 'teamId'} (Player table)

    Team is matched by displayName == Team.name (case-insensitive), falling back to the
    abbreviation (with ESPN -> NBA.com mapping). Player is matched by normalized name on
    that team, then league-wide if unique, else left null. Entries whose team cannot be
    matched are dropped (teamId is required).
    """
    fetched_at = fetched_at or datetime.now(timezone.utc).replace(tzinfo=None)
    team_by_name = {}
    team_by_abbr = {}
    for t in teams or []:
        if t.get('name'):
            team_by_name[str(t['name']).strip().lower()] = str(t['id'])
        if t.get('abbreviation'):
            team_by_abbr[str(t['abbreviation']).strip().upper()] = str(t['id'])

    team_players = {}   # teamId -> {normalized name: playerId}
    league_players = {}  # normalized name -> set(playerId)
    for p in players or []:
        norm = normalize_name(p.get('fullName'))
        if not norm:
            continue
        pid = str(p['id'])
        if p.get('teamId'):
            team_players.setdefault(str(p['teamId']), {})[norm] = pid
        league_players.setdefault(norm, set()).add(pid)

    def match_team(display_name, abbr):
        if display_name:
            tid = team_by_name.get(str(display_name).strip().lower())
            if tid:
                return tid
        if abbr:
            a = str(abbr).strip().upper()
            return team_by_abbr.get(ESPN_ABBR_MAP.get(a, a))
        return None

    def match_player(name, team_id):
        norm = normalize_name(name)
        if not norm:
            return None
        pid = team_players.get(team_id, {}).get(norm)
        if pid:
            return pid
        candidates = league_players.get(norm, set())
        return next(iter(candidates)) if len(candidates) == 1 else None

    groups = payload.get('injuries') if isinstance(payload, dict) else None
    if not isinstance(groups, list):
        return []

    rows = {}
    for group in groups:
        if not isinstance(group, dict):
            continue
        entries = group.get('injuries')
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            player_name = _clean(_get(entry, 'athlete', 'displayName'))
            team_id = match_team(
                group.get('displayName'),
                _get(entry, 'athlete', 'team', 'abbreviation') or group.get('abbreviation'),
            )
            if not player_name or not team_id:
                continue
            status = _clean(entry.get('status')) or _clean(_get(entry, 'type', 'description')) or 'Unknown'
            rows[(team_id, player_name)] = {
                'id': generate_cuid(),
                'source': SOURCE,
                'teamId': team_id,
                'playerId': match_player(player_name, team_id),
                'playerName': player_name,
                'status': status,
                'injuryType': _clean(_get(entry, 'details', 'type')),
                'detail': _clean(entry.get('shortComment')) or _clean(entry.get('longComment')),
                'returnDate': _parse_dt(_get(entry, 'details', 'returnDate')),
                'reportedAt': _parse_dt(entry.get('date')),
                'fetchedAt': fetched_at,
            }

    return list(rows.values())


def fetch_injuries():
    """
    Fetch ESPN injuries and replace all source='espn' rows in one transaction.
    Never raises; returns the number of rows written (0 on any failure).
    """
    print("[INJURIES] Fetching ESPN injury report...")
    try:
        resp = requests.get(ESPN_INJURIES_URL, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        payload = resp.json()
    except Exception as e:
        print(f"  [WARN] ESPN injuries unavailable: {e}")
        return 0

    try:
        with get_db() as session:
            teams = [dict(r._mapping) for r in session.execute(
                text('SELECT "id", "name", "abbreviation" FROM "Team"'))]
            players = [dict(r._mapping) for r in session.execute(
                text('SELECT "id", "fullName", "teamId" FROM "Player"'))]

        rows = transform_injuries(payload, teams, players)
        if not rows:
            print("  [WARN] No injuries parsed (ESPN format may have changed); keeping previous snapshot")
            return 0

        quoted = ', '.join(f'"{c}"' for c in INJURY_COLUMNS)
        placeholders = ', '.join(f':{c}' for c in INJURY_COLUMNS)
        with get_db() as session:
            session.execute(text('DELETE FROM "PlayerInjury" WHERE "source" = :s'), {'s': SOURCE})
            session.execute(
                text(f'INSERT INTO "PlayerInjury" ({quoted}) VALUES ({placeholders})'),
                [{c: r.get(c) for c in INJURY_COLUMNS} for r in rows],
            )
        matched = sum(1 for r in rows if r['playerId'])
        print(f"  [OK] Replaced ESPN injuries: {len(rows)} rows ({matched} matched to a player)")
        return len(rows)
    except Exception as e:
        print(f"  [WARN] Could not store ESPN injuries: {e}")
        return 0


if __name__ == '__main__':
    fetch_injuries()
