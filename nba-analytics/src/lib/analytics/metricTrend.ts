/**
 * Game-by-game trend of every ranked team metric: the single game, a rolling window and the
 * season to date. Every value is a box-score profile over a set of games (totals first, then
 * divide), so the rolling and season lines use the same math as the season ranks.
 */
import { buildTeamProfiles, type GameRecord } from "./teamProfiles";
import { RANKED_METRICS, type RankedMetric } from "./ranks";
import { ROLLING_WINDOW } from "./trend";

export type MetricValues = Record<RankedMetric, number | null>;

export interface MetricTrendGame {
  gameId: string;
  gameDate: Date;
  opponentId: string;
  won: boolean;
  /** this game alone */
  game: MetricValues;
  /** this game and the previous ROLLING_WINDOW − 1 */
  rolling: MetricValues;
  /** every game up to and including this one */
  toDate: MetricValues;
}

function valuesOf(games: GameRecord[], teamId: string): MetricValues {
  const p = buildTeamProfiles(games).get(teamId);
  const out = {} as MetricValues;
  for (const m of RANKED_METRICS) out[m] = p ? p[m] : null;
  return out;
}

/** Oldest → newest. The last game's `toDate` equals the season profile. */
export function metricTrend(games: GameRecord[], teamId: string, window = ROLLING_WINDOW): MetricTrendGame[] {
  const mine = games
    .filter((g) => g.home.teamId === teamId || g.away.teamId === teamId)
    .sort((a, b) => a.gameDate.getTime() - b.gameDate.getTime());
  return mine.map((g, i) => {
    const isHome = g.home.teamId === teamId;
    const us = isHome ? g.home : g.away;
    const them = isHome ? g.away : g.home;
    return {
      gameId: g.gameId,
      gameDate: g.gameDate,
      opponentId: them.teamId,
      won: us.pts > them.pts,
      game: valuesOf([g], teamId),
      rolling: valuesOf(mine.slice(Math.max(0, i - window + 1), i + 1), teamId),
      toDate: valuesOf(mine.slice(0, i + 1), teamId),
    };
  });
}
