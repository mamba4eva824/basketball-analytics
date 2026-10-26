import { leagueDate } from "@/lib/constants";

/**
 * Focus-team schedule: game state, rest days and back-to-backs from ScheduledGame rows.
 * Pure — the /api/schedule route queries and passes rows in. Dates are league (US Eastern)
 * calendar dates, the same `gameDateEt` the NBA schedule uses.
 */

export type ScheduleState = "final" | "today" | "pending" | "scheduled";

export interface ScheduleRow {
  gameId: string;
  gameDateUtc: Date;
  gameDateEt: string;
  status: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
}

export interface ScheduleEntry {
  gameId: string;
  homeAway: "HOME" | "AWAY";
  opponentId: string;
  state: ScheduleState;
  result: "W" | "L" | null;
  points: number | null;
  oppPoints: number | null;
  /** full days off since the previous game; null for the first game */
  restDays: number | null;
  backToBack: boolean;
}

/** A non-final game is treated as in progress for this long after tip-off, then as waiting on the next ETL refresh. */
const PENDING_AFTER_MS = 4 * 3600 * 1000;

function dayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

export function scheduleState(row: ScheduleRow, now: Date): ScheduleState {
  if (row.status === 3 && row.homeScore != null && row.awayScore != null) return "final";
  if (row.gameDateEt === leagueDate(now)) return "today";
  const sinceTip = now.getTime() - row.gameDateUtc.getTime();
  // A late tip (e.g. 10:30 pm ET) is still being played after midnight ET, on the next league date
  if (sinceTip >= 0 && sinceTip < PENDING_AFTER_MS) return "today";
  if (sinceTip >= PENDING_AFTER_MS) return "pending";
  return "scheduled";
}

export function buildSchedule(rows: ScheduleRow[], teamId: string, now: Date): ScheduleEntry[] {
  const ordered = [...rows].sort((a, b) => a.gameDateUtc.getTime() - b.gameDateUtc.getTime());
  return ordered.map((g, i) => {
    const isHome = g.homeTeamId === teamId;
    const state = scheduleState(g, now);
    const points = state === "final" ? (isHome ? g.homeScore : g.awayScore) : null;
    const oppPoints = state === "final" ? (isHome ? g.awayScore : g.homeScore) : null;
    const restDays = i > 0 ? dayNumber(g.gameDateEt) - dayNumber(ordered[i - 1].gameDateEt) - 1 : null;
    return {
      gameId: g.gameId,
      homeAway: isHome ? "HOME" : "AWAY",
      opponentId: isHome ? g.awayTeamId : g.homeTeamId,
      state,
      result: points != null && oppPoints != null ? (points > oppPoints ? "W" : "L") : null,
      points,
      oppPoints,
      restDays,
      backToBack: restDays === 0,
    };
  });
}

export interface ScheduleSummary {
  wins: number;
  losses: number;
  played: number;
  remaining: number;
  remainingHome: number;
  remainingAway: number;
  remainingBackToBacks: number;
}

export function summarizeSchedule(entries: ScheduleEntry[]): ScheduleSummary {
  const left = entries.filter((e) => e.state !== "final");
  return {
    wins: entries.filter((e) => e.result === "W").length,
    losses: entries.filter((e) => e.result === "L").length,
    played: entries.length - left.length,
    remaining: left.length,
    remainingHome: left.filter((e) => e.homeAway === "HOME").length,
    remainingAway: left.filter((e) => e.homeAway === "AWAY").length,
    remainingBackToBacks: left.filter((e) => e.backToBack).length,
  };
}
