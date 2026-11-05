/**
 * "Who's driving it": the players behind each team focus area. Box-score drivers (turnovers,
 * offensive rebounds, defensive rebounds) come from player game logs — per 36 minutes and share of
 * the team's total, season vs the team's last 10 games. Rating drivers (DRtg, ORtg, net) are the
 * team's rating with each player on vs off the floor, from the Lineup Lab totals (season to date).
 * Pure: /api/progress/drivers loads the rows. Spec: basketball-metrics skill → "Player drivers".
 */
import type { RankedMetric } from "./ranks";
import { NEVER_TOGETHER, comboRow, type GroupTotals } from "./lineupCombos";
import { RECENT_GAMES, SMALL_SAMPLE_GAMES } from "./seasonProgress";

export type BoxStat = "tov" | "oreb" | "dreb";
export type RatingStat = "defRtg" | "offRtg" | "netRtg";

/** Which player number explains each team metric. Metrics not listed have no player breakdown. */
export const DRIVER_FOR: Partial<Record<RankedMetric, { kind: "box"; stat: BoxStat } | { kind: "onoff"; stat: RatingStat }>> = {
  tovPct: { kind: "box", stat: "tov" },
  orebPct: { kind: "box", stat: "oreb" },
  // our defensive rebounds are what keep the opponent's offensive-rebound rate down
  oppOrebPct: { kind: "box", stat: "dreb" },
  defRtg: { kind: "onoff", stat: "defRtg" },
  offRtg: { kind: "onoff", stat: "offRtg" },
  netRtg: { kind: "onoff", stat: "netRtg" },
};

/** Lower is better for turnovers and defensive rating; higher for the rest. */
const LOWER_BETTER: ReadonlySet<BoxStat | RatingStat> = new Set(["tov", "defRtg"]);

/** Per-36 change between last 10 and season that counts as improving / slipping (rebounds). */
export const PER36_MIN_CHANGE: Record<BoxStat, number> = { tov: 0.5, oreb: 0.5, dreb: 0.75 };
/**
 * Turnovers are judged per play the player used (FGA + 0.44·FTA + TOV, the team TOV% formula at
 * player level), so a heavier load isn't read as sloppier play; this change in TOV per 100 plays
 * counts as improving / slipping.
 */
export const TOV_PER100_MIN_CHANGE = 2;
/** Under this many minutes in a window, per-36 rates are flagged small sample. */
export const PER36_SMALL_SAMPLE_MINUTES = 100;
/** On/off: under this many minutes on — or off — the floor is a small sample. */
export const ONOFF_SMALL_MINUTES = 50;

export interface PlayerLog {
  playerId: string;
  gameId: string;
  gameDate: Date;
  minutes: number | null;
  tov: number;
  oreb: number;
  dreb: number;
  fga: number;
  fta: number;
}

/** The team's own totals per game (player + team turnovers, as in the box score). */
export interface TeamGameTotals {
  gameId: string;
  gameDate: Date;
  tov: number;
  oreb: number | null;
  dreb: number | null;
}

export interface BoxWindow {
  games: number;
  minutes: number;
  total: number;
  per36: number | null;
  /** turnovers only: 100 · TOV / (FGA + 0.44·FTA + TOV) — turnovers per 100 plays the player used */
  per100Plays: number | null;
  /** share of the team's total in the games of this window (all team games, played or not) */
  share: number | null;
  smallSample: boolean;
}

export interface BoxDriver {
  playerId: string;
  season: BoxWindow;
  /** the player's games among the team's last RECENT_GAMES */
  recent: BoxWindow;
  /** NBA.com season usage rate (share of team plays used on the floor), turnovers only; null if not loaded */
  usage: number | null;
  /** last 10 vs season (per 100 plays for turnovers, per 36 otherwise), in the better direction; null with a small last-10 sample */
  trend: "improving" | "slipping" | "steady" | null;
}

export interface OnOffDriver {
  playerId: string;
  minutesOn: number | null;
  minutesOff: number | null;
  on: number | null;
  off: number | null;
  /** on − off, signed so positive is always better for the team */
  impact: number | null;
  smallSample: boolean;
  error: string | null;
}

const per36 = (total: number, minutes: number) => (minutes > 0 ? (36 * total) / minutes : null);

function windowTotals(logs: PlayerLog[], team: TeamGameTotals[], stat: BoxStat): BoxWindow {
  const minutes = logs.reduce((s, l) => s + (l.minutes ?? 0), 0);
  const total = logs.reduce((s, l) => s + l[stat], 0);
  const teamTotal = team.reduce<number | null>((s, g) => (s == null || g[stat] == null ? null : s + g[stat]!), 0);
  const plays = logs.reduce((s, l) => s + l.fga + 0.44 * l.fta + l.tov, 0);
  return {
    games: logs.length,
    minutes,
    total,
    per36: per36(total, minutes),
    per100Plays: stat === "tov" && plays > 0 ? (100 * total) / plays : null,
    share: teamTotal != null && teamTotal > 0 ? total / teamTotal : null,
    smallSample: logs.length < SMALL_SAMPLE_GAMES || minutes < PER36_SMALL_SAMPLE_MINUTES,
  };
}

/**
 * One row per player who logged minutes, sorted by share of the team's season total (the biggest
 * contributors first). Shares are of all the team's games; turnovers include team turnovers no
 * player is charged with, so shares can add up to less than 100%.
 */
export function boxDrivers(
  logs: PlayerLog[],
  teamGames: TeamGameTotals[],
  stat: BoxStat,
  seasonUsage: ReadonlyMap<string, number | null> = new Map(),
): BoxDriver[] {
  const games = [...teamGames].sort((a, b) => a.gameDate.getTime() - b.gameDate.getTime());
  const recentIds = new Set(games.slice(-RECENT_GAMES).map((g) => g.gameId));
  const recentTeam = games.filter((g) => recentIds.has(g.gameId));
  const teamIds = new Set(games.map((g) => g.gameId));
  const byPlayer = new Map<string, PlayerLog[]>();
  for (const l of logs) {
    if (!teamIds.has(l.gameId) || !(l.minutes && l.minutes > 0)) continue;
    byPlayer.set(l.playerId, [...(byPlayer.get(l.playerId) ?? []), l]);
  }
  const lowerBetter = LOWER_BETTER.has(stat);
  return [...byPlayer]
    .map(([playerId, mine]) => {
      const season = windowTotals(mine, games, stat);
      const recent = windowTotals(mine.filter((l) => recentIds.has(l.gameId)), recentTeam, stat);
      const rate = (w: BoxWindow) => (stat === "tov" ? w.per100Plays : w.per36);
      const minChange = stat === "tov" ? TOV_PER100_MIN_CHANGE : PER36_MIN_CHANGE[stat];
      let trend: BoxDriver["trend"] = null;
      const [now, base] = [rate(recent), rate(season)];
      if (!recent.smallSample && now != null && base != null) {
        const d = now - base;
        trend = Math.abs(d) < minChange ? "steady" : (lowerBetter ? d < 0 : d > 0) ? "improving" : "slipping";
      }
      return { playerId, season, recent, usage: stat === "tov" ? (seasonUsage.get(playerId) ?? null) : null, trend };
    })
    .sort((a, b) => (b.season.share ?? 0) - (a.season.share ?? 0) || b.season.minutes - a.season.minutes);
}

/**
 * Share of the team's season total no player is charged with (e.g. team turnovers). Negative means
 * the players' logs add up to more than the team box score — the two are out of sync (e.g. a
 * partial ETL run); not clamped, so the UI can say so.
 */
export function unattributedShare(drivers: BoxDriver[]): number | null {
  if (!drivers.length || drivers.some((d) => d.season.share == null)) return null;
  return 1 - drivers.reduce((s, d) => s + d.season.share!, 0);
}

/**
 * Team rating with each player on the floor vs off it (season to date), from the same group totals
 * and formulas as the Lineup Lab. One pass per player for all three ratings; each list is sorted by
 * impact, best first, with players that have no impact last.
 */
export function onOffDrivers(
  playerIds: string[],
  lookup: (key: string) => GroupTotals | undefined,
  sizes: ReadonlySet<number>,
): Record<RatingStat, OnOffDriver[]> {
  const rows = playerIds.map((id) => {
    const on = comboRow(lookup, [id], [], sizes, "selection", id);
    const off = comboRow(lookup, [], [id], sizes, "without", id);
    // no minutes off the floor: say so, rather than the generic "never on the floor" wording
    const offError = off.error === NEVER_TOGETHER ? "Never off the floor this season, so there are no off-court minutes to compare." : off.error;
    return { id, on, off, error: on.error ?? offError };
  });
  const forStat = (stat: RatingStat): OnOffDriver[] => {
    const sign = LOWER_BETTER.has(stat) ? -1 : 1;
    return rows
      .map(({ id, on, off, error }) => {
        const onV = on.error ? null : on[stat];
        const offV = off.error ? null : off[stat];
        return {
          playerId: id,
          minutesOn: on.minutes,
          minutesOff: off.minutes,
          on: onV,
          off: offV,
          impact: onV != null && offV != null ? sign * (onV - offV) : null,
          smallSample: (on.minutes ?? 0) < ONOFF_SMALL_MINUTES || (off.minutes ?? 0) < ONOFF_SMALL_MINUTES,
          error,
        };
      })
      .sort((a, b) => (b.impact ?? -Infinity) - (a.impact ?? -Infinity) || (b.minutesOn ?? 0) - (a.minutesOn ?? 0));
  };
  return { defRtg: forStat("defRtg"), offRtg: forStat("offRtg"), netRtg: forStat("netRtg") };
}
