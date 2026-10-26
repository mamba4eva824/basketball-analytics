/** Player form over a window of game logs. Spec: basketball-metrics → "Player form". */

export interface LogLine {
  gameDate: Date;
  minutes: number | null;
  points: number;
  rebounds: number;
  assists: number;
  fga: number;
  fta: number;
  fg3m: number;
  plusMinus: number | null;
  dnp?: boolean;
}

export interface FormSummary {
  games: number;
  minutes: number | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  fg3m: number | null;
  plusMinus: number | null;
  tsPct: number | null;
}

export const TREND_THRESHOLD = 0.1;

const played = (l: LogLine) => !l.dnp && (l.minutes ?? 0) > 0;

export function trueShooting(points: number, fga: number, fta: number): number | null {
  const denom = 2 * (fga + 0.44 * fta);
  return denom > 0 ? points / denom : null;
}

/** Averages over the most recent `n` games played (all games if n is omitted). */
export function summarizeForm(logs: LogLine[], n?: number): FormSummary {
  const games = logs.filter(played).sort((a, b) => a.gameDate.getTime() - b.gameDate.getTime());
  const window = n ? games.slice(-n) : games;
  const count = window.length;
  if (count === 0) {
    return { games: 0, minutes: null, points: null, rebounds: null, assists: null, fg3m: null, plusMinus: null, tsPct: null };
  }
  const sum = (f: (l: LogLine) => number) => window.reduce((acc, l) => acc + f(l), 0);
  const pm = window.filter((l) => l.plusMinus != null);
  const pts = sum((l) => l.points);
  return {
    games: count,
    minutes: sum((l) => l.minutes ?? 0) / count,
    points: pts / count,
    rebounds: sum((l) => l.rebounds) / count,
    assists: sum((l) => l.assists) / count,
    fg3m: sum((l) => l.fg3m) / count,
    plusMinus: pm.length ? pm.reduce((a, l) => a + (l.plusMinus ?? 0), 0) / pm.length : null,
    tsPct: trueShooting(pts, sum((l) => l.fga), sum((l) => l.fta)),
  };
}

/** A game log with full shooting and defensive counts — enough to rebuild a season line. */
export interface BoxLogLine extends LogLine {
  fgm: number;
  fg3a: number;
  ftm: number;
  steals: number;
  blocks: number;
  turnovers: number;
}

export interface LogSeasonLine {
  gamesPlayed: number;
  minutes: number | null;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fgPct: number | null;
  threePct: number | null;
  threeAttempts: number;
  ftPct: number | null;
  tsPct: number | null;
  plusMinus: number | null;
}

/**
 * A season-to-date line from game logs (per-game averages over games played; percentages from
 * totals). Used for "as of" views, where the stored season stats would include later games.
 * null when the player hasn't played.
 */
export function seasonLineFromLogs(logs: BoxLogLine[]): LogSeasonLine | null {
  const games = logs.filter(played);
  const n = games.length;
  if (!n) return null;
  const sum = (f: (l: BoxLogLine) => number) => games.reduce((acc, l) => acc + f(l), 0);
  const pct = (made: number, att: number) => (att > 0 ? made / att : null);
  const pm = games.filter((l) => l.plusMinus != null);
  const pts = sum((l) => l.points);
  const fga = sum((l) => l.fga);
  const fta = sum((l) => l.fta);
  const fg3a = sum((l) => l.fg3a);
  return {
    gamesPlayed: n,
    minutes: sum((l) => l.minutes ?? 0) / n,
    points: pts / n,
    rebounds: sum((l) => l.rebounds) / n,
    assists: sum((l) => l.assists) / n,
    steals: sum((l) => l.steals) / n,
    blocks: sum((l) => l.blocks) / n,
    turnovers: sum((l) => l.turnovers) / n,
    fgPct: pct(sum((l) => l.fgm), fga),
    threePct: pct(sum((l) => l.fg3m), fg3a),
    threeAttempts: fg3a / n,
    ftPct: pct(sum((l) => l.ftm), fta),
    tsPct: trueShooting(pts, fga, fta),
    plusMinus: pm.length ? pm.reduce((a, l) => a + (l.plusMinus ?? 0), 0) / pm.length : null,
  };
}

export type Trend = "up" | "down" | "flat";

export function trendOf(recent: number | null, season: number | null): Trend | null {
  if (recent == null || season == null) return null;
  if (season === 0) return recent > 0 ? "up" : "flat";
  const change = (recent - season) / Math.abs(season);
  if (change >= TREND_THRESHOLD) return "up";
  if (change <= -TREND_THRESHOLD) return "down";
  return "flat";
}
