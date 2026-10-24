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
