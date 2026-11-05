"""
Fetch NBA.com lineup-group totals for the Lineup Lab (/lineups).
Populates: LineupGroupStats.

For one team-season (10 stats.nba.com calls, all PerMode=Totals, regular season):
  - TeamDashLineups, GroupQuantity 2, 3, 4, 5 × MeasureType Base + Opponent (8 calls):
    every 2/3/4/5-man group that shared the floor.
  - TeamPlayerOnOffDetails × Base + Opponent (2 calls): the team overall (groupSize 0) and
    each player's on-court totals (groupSize 1).

Only additive totals are stored, so the app can compute "A and B on, C off" exactly by
subtraction (inclusion–exclusion, src/lib/analytics/lineupCombos.ts). Opponent totals are
optional: if that call fails or its columns differ, the opponent fields stay NULL and the app
falls back to one-sided possessions.

Each group size is replaced as a whole (delete + insert) only when its Base call succeeded, so a
failed call keeps yesterday's rows instead of leaving a hole.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime

from nba_api.stats.endpoints import TeamDashLineups, TeamPlayerOnOffDetails

from config import CURRENT_SEASON_YEAR, LAKERS_TEAM_ID
from utils import get_db, safe_call, generate_cuid, safe_int, safe_float, upsert_rows, execute_sql

GROUP_SIZES = (2, 3, 4, 5)

TEAM_STAT_COLUMNS = {
    'pts': 'PTS', 'fgm': 'FGM', 'fga': 'FGA', 'fg3m': 'FG3M', 'fg3a': 'FG3A',
    'ftm': 'FTM', 'fta': 'FTA', 'oreb': 'OREB', 'dreb': 'DREB', 'ast': 'AST',
    'tov': 'TOV', 'stl': 'STL', 'blk': 'BLK',
}
OPP_STAT_COLUMNS = {
    'oppPts': 'OPP_PTS', 'oppFgm': 'OPP_FGM', 'oppFga': 'OPP_FGA', 'oppFg3m': 'OPP_FG3M',
    'oppFg3a': 'OPP_FG3A', 'oppFtm': 'OPP_FTM', 'oppFta': 'OPP_FTA', 'oppOreb': 'OPP_OREB',
    'oppDreb': 'OPP_DREB', 'oppTov': 'OPP_TOV',
}

LINEUP_GROUP_COLUMNS = [
    'id', 'teamId', 'season', 'seasonId', 'groupSize', 'groupKey', 'gamesPlayed', 'minutes',
    *TEAM_STAT_COLUMNS.keys(), 'plusMinus', *OPP_STAT_COLUMNS.keys(),
    'createdAt', 'updatedAt',
]


# ── Pure transforms ──────────────────────────────────────────────────────────

def parse_group_id(group_id):
    """'-203076-1628398-2544-' → ['1628398', '203076', '2544'] (string-sorted, like the app's groupKey)."""
    if group_id is None:
        return []
    s = str(group_id)
    if s in ('', 'nan', 'None'):
        return []
    return sorted(p for p in s.replace(' ', '').split('-') if p)


def _round_int(val):
    f = safe_float(val)
    return None if f is None else int(round(f))


def _base_fields(row):
    out = {k: _round_int(row.get(col)) or 0 for k, col in TEAM_STAT_COLUMNS.items()}
    out['gamesPlayed'] = safe_int(row.get('GP'), 0)
    out['minutes'] = safe_float(row.get('MIN'), 0.0)
    out['plusMinus'] = _round_int(row.get('PLUS_MINUS')) or 0
    return out


def _opp_fields(row):
    """Opponent totals, all-or-nothing: if any column is missing the whole set is None."""
    if row is None:
        return {k: None for k in OPP_STAT_COLUMNS}
    vals = {k: _round_int(row.get(col)) for k, col in OPP_STAT_COLUMNS.items()}
    if any(v is None for v in vals.values()):
        return {k: None for k in OPP_STAT_COLUMNS}
    return vals


def _row(team_id, season, group_size, group_key, base, opp, now):
    return {
        'id': generate_cuid(),
        'teamId': str(team_id),
        'season': season,
        'seasonId': season,
        'groupSize': group_size,
        'groupKey': group_key,
        **base,
        **opp,
        'createdAt': now,
        'updatedAt': now,
    }


def transform_lineup_groups(base_df, opp_df, team_id, season, group_size, now=None):
    """TeamDashLineups 'Lineups' frames (Base, Opponent) → LineupGroupStats rows for one group size."""
    now = now or datetime.utcnow()
    if base_df is None or base_df.empty:
        return []
    opp_by_key = {}
    if opp_df is not None and not opp_df.empty and 'GROUP_ID' in opp_df.columns:
        for _, r in opp_df.iterrows():
            ids = parse_group_id(r.get('GROUP_ID'))
            if len(ids) == group_size:
                opp_by_key['-'.join(ids)] = r
    rows = []
    for _, r in base_df.iterrows():
        ids = parse_group_id(r.get('GROUP_ID'))
        if len(ids) != group_size:
            continue
        key = '-'.join(ids)
        rows.append(_row(team_id, season, group_size, key, _base_fields(r), _opp_fields(opp_by_key.get(key)), now))
    return rows


def _pick(frames, predicate):
    return next((d for d in (frames or []) if d is not None and predicate(d)), None)


def overall_frame(frames):
    """TeamPlayerOnOffDetails 'Overall' set: has GROUP_VALUE, no VS_PLAYER_ID."""
    return _pick(frames, lambda d: 'GROUP_VALUE' in d.columns and 'VS_PLAYER_ID' not in d.columns)


def on_court_frame(frames):
    """TeamPlayerOnOffDetails 'PlayersOnCourt' set (COURT_STATUS = On)."""
    d = _pick(frames, lambda d: 'VS_PLAYER_ID' in d.columns and 'COURT_STATUS' in d.columns
              and (d['COURT_STATUS'].astype(str).str.lower() == 'on').any())
    if d is None:
        return None
    return d[d['COURT_STATUS'].astype(str).str.lower() == 'on']


def transform_on_off(base_frames, opp_frames, team_id, season, now=None):
    """TeamPlayerOnOffDetails frames (Base, Opponent) → team (groupSize 0) + player on-court (1) rows."""
    now = now or datetime.utcnow()
    rows = []

    overall = overall_frame(base_frames)
    opp_overall = overall_frame(opp_frames)
    if overall is not None and not overall.empty:
        opp_row = opp_overall.iloc[0] if opp_overall is not None and not opp_overall.empty else None
        rows.append(_row(team_id, season, 0, '', _base_fields(overall.iloc[0]), _opp_fields(opp_row), now))

    on = on_court_frame(base_frames)
    opp_on = on_court_frame(opp_frames)
    opp_by_player = {}
    if opp_on is not None:
        for _, r in opp_on.iterrows():
            pid = safe_int(r.get('VS_PLAYER_ID'))
            if pid:
                opp_by_player[str(pid)] = r
    if on is not None:
        for _, r in on.iterrows():
            pid = safe_int(r.get('VS_PLAYER_ID'))
            if not pid:
                continue
            key = str(pid)
            rows.append(_row(team_id, season, 1, key, _base_fields(r), _opp_fields(opp_by_player.get(key)), now))
    return rows


# ── Fetch + load ─────────────────────────────────────────────────────────────

def _lineups_frame(frames):
    return _pick(frames, lambda d: 'GROUP_ID' in d.columns)


def _try(label, fn):
    try:
        return fn()
    except Exception as e:  # one failed call shouldn't sink the other sizes
        print(f"    [WARN] {label}: {e}")
        return None


def fetch_lineup_groups(season=None, team_id=None):
    """Fetch and store LineupGroupStats for one team-season. Returns the rows written."""
    season = season or CURRENT_SEASON_YEAR
    team_id = str(team_id or LAKERS_TEAM_ID)
    common = dict(team_id=team_id, season=season, season_type_all_star='Regular Season', per_mode_detailed='Totals')
    print(f"[LINEUP GROUPS] Team {team_id}, season {season}...")

    by_size = {}
    for size in GROUP_SIZES:
        base = _try(f"{size}-man Base", lambda: safe_call(TeamDashLineups, group_quantity=size, measure_type_detailed_defense='Base', **common))
        if base is None:
            continue
        opp = _try(f"{size}-man Opponent", lambda: safe_call(TeamDashLineups, group_quantity=size, measure_type_detailed_defense='Opponent', **common))
        by_size[size] = transform_lineup_groups(_lineups_frame(base), _lineups_frame(opp), team_id, season, size)
        print(f"  {size}-man groups: {len(by_size[size])}")

    base = _try("on/off Base", lambda: safe_call(TeamPlayerOnOffDetails, measure_type_detailed_defense='Base', **common))
    if base is not None:
        opp = _try("on/off Opponent", lambda: safe_call(TeamPlayerOnOffDetails, measure_type_detailed_defense='Opponent', **common))
        rows = transform_on_off(base, opp, team_id, season)
        team_rows = [r for r in rows if r['groupSize'] == 0]
        player_rows = [r for r in rows if r['groupSize'] == 1]
        if team_rows:
            by_size[0] = team_rows
        if player_rows:
            by_size[1] = player_rows
        print(f"  team totals: {len(team_rows)}, players on court: {len(player_rows)}")

    written = []
    if by_size:
        with get_db() as session:
            for size, rows in by_size.items():
                execute_sql(
                    session,
                    'DELETE FROM "LineupGroupStats" WHERE "teamId" = :t AND "season" = :s AND "groupSize" = :g',
                    {'t': team_id, 's': season, 'g': size},
                )
                upsert_rows(session, 'LineupGroupStats', rows, LINEUP_GROUP_COLUMNS,
                            ['teamId', 'season', 'groupKey'], exclude_from_update={'id', 'createdAt'})
                written.extend(rows)
        print(f"  [OK] Wrote {len(written)} LineupGroupStats rows (sizes {sorted(by_size)})")
    return written


if __name__ == '__main__':
    fetch_lineup_groups()
