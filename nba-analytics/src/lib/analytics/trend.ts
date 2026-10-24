/** Per-game ratings for one team with a rolling net rating. */
import { buildTeamProfiles, type GameRecord } from "./teamProfiles";

export const ROLLING_WINDOW = 5;

/** Trailing mean: out[i] = mean(values[max(0, i−window+1) .. i]). */
export function rollingMean(values: number[], window = ROLLING_WINDOW): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1);
    return slice.reduce((a, v) => a + v, 0) / slice.length;
  });
}

export interface GameRating {
  gameId: string;
  gameDate: Date;
  opponentId: string;
  won: boolean;
  offRtg: number;
  defRtg: number;
  netRtg: number;
  /** rolling mean of netRtg over the last ROLLING_WINDOW measurable games */
  rollingNet: number;
}

/** Oldest → newest. Games without measurable possessions (missing OREB) are skipped. */
export function gameRatings(games: GameRecord[], teamId: string): GameRating[] {
  const rows = games
    .filter((g) => g.home.teamId === teamId || g.away.teamId === teamId)
    .sort((a, b) => a.gameDate.getTime() - b.gameDate.getTime())
    .flatMap((g) => {
      const p = buildTeamProfiles([g]).get(teamId)!;
      if (p.offRtg == null || p.defRtg == null || p.netRtg == null) return [];
      return [{
        gameId: g.gameId,
        gameDate: g.gameDate,
        opponentId: g.home.teamId === teamId ? g.away.teamId : g.home.teamId,
        won: p.wins === 1,
        offRtg: p.offRtg,
        defRtg: p.defRtg,
        netRtg: p.netRtg,
        rollingNet: 0,
      }];
    });
  const rolling = rollingMean(rows.map((r) => r.netRtg));
  rows.forEach((r, i) => (r.rollingNet = rolling[i]));
  return rows;
}
