/**
 * Simple, explainable matchup estimate. Spec: basketball-metrics skill → "Matchup projection".
 */
import type { LeagueBaseline, TeamProfile } from "./teamProfiles";

export const REGRESSION_GAMES = 10;
export const HOME_COURT_POINTS = 1.0; // added to home, subtracted from away (≈2-pt margin)
export const MARGIN_SD = 12;
export const SMALL_SAMPLE_GAMES = 5;

/** Shrink an early-season value toward the league average by K pseudo-games. */
export function regress(value: number, games: number, leagueAvg: number, k = REGRESSION_GAMES): number {
  return (games * value + k * leagueAvg) / (games + k);
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26, |error| < 1.5e-7). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(x) / Math.SQRT2));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

export interface ProjectionSide {
  teamId: string;
  points: number;
  adjOffRtg: number;
  adjDefRtg: number;
  adjPace: number;
  expectedOffRtg: number;
}

export interface Projection {
  home: ProjectionSide;
  away: ProjectionSide;
  pace: number;
  /** home − away */
  margin: number;
  homeWinProb: number;
  smallSample: boolean;
  neutral: boolean;
}

/**
 * `neutral` drops home-court points (used when no game is scheduled between the teams).
 * Returns null when either team has no measurable possessions.
 */
export function projectGame(
  home: TeamProfile,
  away: TeamProfile,
  league: LeagueBaseline,
  opts: { neutral?: boolean } = {},
): Projection | null {
  const hca = opts.neutral ? 0 : HOME_COURT_POINTS;
  const adj = (p: TeamProfile) => {
    if (p.offRtg == null || p.defRtg == null || p.pace == null) return null;
    const n = p.team.possGames; // regress by the games the ratings were measured on
    return {
      off: regress(p.offRtg, n, league.offRtg),
      def: regress(p.defRtg, n, league.offRtg),
      pace: regress(p.pace, n, league.pace),
    };
  };
  const h = adj(home);
  const a = adj(away);
  if (!h || !a) return null;
  const pace = (h.pace * a.pace) / league.pace;
  const homeExp = h.off + a.def - league.offRtg;
  const awayExp = a.off + h.def - league.offRtg;
  const homePts = (pace * homeExp) / 100 + hca;
  const awayPts = (pace * awayExp) / 100 - hca;
  const margin = homePts - awayPts;
  return {
    home: { teamId: home.teamId, points: homePts, adjOffRtg: h.off, adjDefRtg: h.def, adjPace: h.pace, expectedOffRtg: homeExp },
    away: { teamId: away.teamId, points: awayPts, adjOffRtg: a.off, adjDefRtg: a.def, adjPace: a.pace, expectedOffRtg: awayExp },
    pace,
    margin,
    homeWinProb: normalCdf(margin / MARGIN_SD),
    smallSample: home.games < SMALL_SAMPLE_GAMES || away.games < SMALL_SAMPLE_GAMES,
    neutral: !!opts.neutral,
  };
}
