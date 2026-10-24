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

export type Trend = "up" | "down" | "flat";

export function trendOf(recent: number | null, season: number | null): Trend | null {
  if (recent == null || season == null) return null;
  if (season === 0) return recent > 0 ? "up" : "flat";
  const change = (recent - season) / Math.abs(season);
  if (change >= TREND_THRESHOLD) return "up";
  if (change <= -TREND_THRESHOLD) return "down";
  return "flat";
}
