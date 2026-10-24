/** Roster classification for a new season. Spec: basketball-metrics → "Roster classification". */

export type RosterStatus = "returning" | "new" | "rookie";

export interface PriorSeasonRow {
  teamId: string;
  gamesPlayed: number;
}

export interface Classification {
  status: RosterStatus;
  /** Team the baseline (previous-season) line comes from, if any. */
  baselineTeamId: string | null;
}

export function classifyPlayer(input: {
  focusTeamId: string;
  currentStartYear: number;
  fromYear: number | null;
  priorSeasonRows: PriorSeasonRow[];
}): Classification {
  const { focusTeamId, currentStartYear, fromYear, priorSeasonRows } = input;
  if (priorSeasonRows.some((r) => r.teamId === focusTeamId)) {
    return { status: "returning", baselineTeamId: focusTeamId };
  }
  if (priorSeasonRows.length > 0) {
    // A player traded mid-season can have several rows; use the one with most games.
    const main = [...priorSeasonRows].sort((a, b) => b.gamesPlayed - a.gamesPlayed)[0];
    return { status: "new", baselineTeamId: main.teamId };
  }
  if (fromYear == null || fromYear >= currentStartYear) {
    return { status: "rookie", baselineTeamId: null };
  }
  return { status: "new", baselineTeamId: null };
}

/** Share of logged minutes played by `new` + `rookie` players; null before any minutes. */
export function newcomerMinutesShare(
  logs: { playerId: string; minutes: number | null }[],
  statusById: Map<string, RosterStatus>,
): number | null {
  let total = 0;
  let newcomer = 0;
  for (const l of logs) {
    const m = l.minutes ?? 0;
    total += m;
    const st = statusById.get(l.playerId);
    if (st === "new" || st === "rookie") newcomer += m;
  }
  return total > 0 ? newcomer / total : null;
}

/**
 * Expected minutes-per-game role, for ordering rotations and picking key players.
 * With an established sample use this season's minutes; otherwise take the larger of this
 * season's and last season's — so a starter who is injured or barely played yet still ranks.
 */
export function roleMinutes(
  current: { minutes: number | null; gamesPlayed: number } | null,
  baseline: { minutes: number | null } | null,
  establishedGames = 5,
): number {
  const cur = current?.minutes ?? 0;
  if (current && current.gamesPlayed >= establishedGames) return cur;
  return Math.max(cur, baseline?.minutes ?? 0);
}

/** The ETL flags a team's starters in a game all at once; fewer than this means not flagged yet. */
export const STARTERS_PER_TEAM = 5;

export interface StartLog {
  playerId: string;
  teamId: string;
  season: string;
  gameId: string;
  started: boolean;
}

export const startKey = (playerId: string, teamId: string, season: string) => `${playerId}|${teamId}|${season}`;

/**
 * Games started per player/team/season (keyed by `startKey`), counted from game-log starter flags —
 * LeagueDashPlayerStats has no GS column, so PlayerSeasonStats.gamesStarted is never real.
 * Starters are only flagged for focus-team games, so a key is left out (→ "—") when the player has
 * no logs, or any of their games lacks `STARTERS_PER_TEAM` flagged starters for their team.
 * `starters` must hold every started row for those games, not just this player's.
 */
export function gamesStartedByPlayer(
  logs: StartLog[],
  starters: { gameId: string; teamId: string }[],
): Map<string, number> {
  const startersPerSide = new Map<string, number>();
  for (const s of starters) {
    const side = `${s.gameId}|${s.teamId}`;
    startersPerSide.set(side, (startersPerSide.get(side) ?? 0) + 1);
  }
  const counts = new Map<string, number | null>();
  for (const l of logs) {
    const key = startKey(l.playerId, l.teamId, l.season);
    const flagged = (startersPerSide.get(`${l.gameId}|${l.teamId}`) ?? 0) >= STARTERS_PER_TEAM;
    const prev = counts.has(key) ? counts.get(key)! : 0;
    counts.set(key, prev == null || !flagged ? null : prev + (l.started ? 1 : 0));
  }
  const out = new Map<string, number>();
  for (const [key, n] of counts) if (n != null) out.set(key, n);
  return out;
}
