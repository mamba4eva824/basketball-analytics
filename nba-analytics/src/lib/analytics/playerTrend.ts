/**
 * Game-by-game trend of a player's box-score metrics: the single game, a rolling window and the
 * season to date. Like the team trend, every value over a set of games is totals first, then
 * divide — never an average of per-game percentages. Only games the player actually played count.
 *
 * Usage is a box-score estimate (Basketball-Reference formula) from the game's team totals; team
 * minutes are the sum of the team's player minutes, so overtime is handled.
 */
import { ROLLING_WINDOW } from "./trend";

export const PLAYER_METRICS = ["pts", "min", "tsPct", "efgPct", "usgPct", "threePaRate", "ftRate", "ast", "reb", "tov", "plusMinus"] as const;
export type PlayerMetric = (typeof PLAYER_METRICS)[number];
export type PlayerMetricValues = Record<PlayerMetric, number | null>;

export interface PlayerGameInput {
  gameId: string;
  gameDate: Date;
  opponentId: string;
  won: boolean;
  min: number;
  pts: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  fta: number;
  reb: number;
  ast: number;
  tov: number;
  plusMinus: number | null;
  /** the player's team in this game */
  team: { fga: number; fta: number; tov: number; min: number };
}

export interface PlayerTrendGame {
  gameId: string;
  gameDate: Date;
  opponentId: string;
  won: boolean;
  game: PlayerMetricValues;
  rolling: PlayerMetricValues;
  toDate: PlayerMetricValues;
}

const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);

/** Every metric over a set of games the player played. */
export function playerMetricValues(games: PlayerGameInput[]): PlayerMetricValues {
  const n = games.length;
  const sum = (f: (g: PlayerGameInput) => number) => games.reduce((s, g) => s + f(g), 0);
  const fga = sum((g) => g.fga);
  const fta = sum((g) => g.fta);
  const min = sum((g) => g.min);
  const pm = games.filter((g) => g.plusMinus != null);
  const teamMin = sum((g) => g.team.min);
  const teamPlays = sum((g) => g.team.fga + 0.44 * g.team.fta + g.team.tov);
  const plays = fga + 0.44 * fta + sum((g) => g.tov);
  return {
    pts: n ? sum((g) => g.pts) / n : null,
    min: n ? min / n : null,
    tsPct: ratio(sum((g) => g.pts), 2 * (fga + 0.44 * fta)),
    efgPct: ratio(sum((g) => g.fgm) + 0.5 * sum((g) => g.fg3m), fga),
    usgPct: ratio(plays * (teamMin / 5), min * teamPlays),
    threePaRate: ratio(sum((g) => g.fg3a), fga),
    ftRate: ratio(fta, fga),
    ast: n ? sum((g) => g.ast) / n : null,
    reb: n ? sum((g) => g.reb) / n : null,
    tov: n ? sum((g) => g.tov) / n : null,
    plusMinus: pm.length ? pm.reduce((s, g) => s + g.plusMinus!, 0) / pm.length : null,
  };
}

/** Oldest → newest, games with minutes only. The last game's `toDate` is the season line. */
export function playerTrend(games: PlayerGameInput[], window = ROLLING_WINDOW): PlayerTrendGame[] {
  const played = games.filter((g) => g.min > 0).sort((a, b) => a.gameDate.getTime() - b.gameDate.getTime());
  return played.map((g, i) => ({
    gameId: g.gameId,
    gameDate: g.gameDate,
    opponentId: g.opponentId,
    won: g.won,
    game: playerMetricValues([g]),
    rolling: playerMetricValues(played.slice(Math.max(0, i - window + 1), i + 1)),
    toDate: playerMetricValues(played.slice(0, i + 1)),
  }));
}
