/**
 * Season-long plus/minus trend for one player, availability-aware.
 * Spec: basketball-metrics skill → "Plus-minus trend".
 *
 * Missed games are gaps, never zeros: the moving average runs over the last N games the
 * player actually played, so an injury absence cannot drag it toward 0.
 */

export const PM_WINDOWS = [5, 10] as const;
export const PM_TREND_POINTS = 3; // last-N vs season avg, in points (+/- crosses zero, so no ratio)
const MIN_WINDOW_MINUTES = 1;

export interface TeamGameSlot {
  gameId: string;
  date: Date;
  opponentAbbr: string;
  won: boolean;
}

export interface PlayerGameLine {
  gameId: string;
  minutes: number | null;
  plusMinus: number | null;
  dnp?: boolean;
  dnpReason?: string | null;
}

export type Availability = "played" | "missed" | "not-with-team";

export interface PlusMinusPoint {
  gameId: string;
  date: Date;
  opponentAbbr: string;
  won: boolean;
  availability: Availability;
  minutes: number | null;
  plusMinus: number | null;
  /** mean +/- over the last `window` games played; null on games not played (chart gap) */
  rollingAvg: number | null;
  /** minutes-weighted +/- per 36 over the same window; null on games not played */
  rollingPer36: number | null;
  /** games actually in the window (smaller than `window` early on) */
  windowGames: number;
  /** why a missed game was missed, when known */
  missedReason: string | null;
}

/**
 * Box scores can't tell an injury from a healthy scratch, so an absence is only called an
 * injury when the injury report or a DNP reason says so.
 */
export type AbsenceKind = "injury" | "other" | "unknown";

export interface Absence {
  startGameId: string;
  endGameId: string;
  games: number;
  reason: string | null;
  kind: AbsenceKind;
  /** true when the absence runs through the latest team game */
  ongoing: boolean;
}

export interface PlusMinusSummary {
  gamesPlayed: number;
  gamesMissed: number;
  seasonAvg: number | null;
  seasonPer36: number | null;
  lastAvg: number | null;
  lastPer36: number | null;
  trend: "up" | "down" | "flat" | null;
  absences: Absence[];
}

export interface PlusMinusTrend {
  points: PlusMinusPoint[];
  summary: PlusMinusSummary;
}

/** A row counts as played only with minutes and a +/-; DNP rows carry a reason, not a value. */
const INJURY_WORDS = /injur|illness|sore|sprain|strain|surgery|concussion|protocol|knee|ankle|hamstring|back|foot|wrist|hip|calf|groin|shoulder/i;

export function absenceKind(reason: string | null, fromInjuryReport = false): AbsenceKind {
  if (fromInjuryReport) return "injury";
  if (!reason) return "unknown";
  return INJURY_WORDS.test(reason) ? "injury" : "other";
}

const isPlayed = (l: PlayerGameLine | undefined): boolean =>
  !!l && !l.dnp && (l.minutes ?? 0) > 0 && l.plusMinus != null;

/**
 * @param slots       the team's games this season (any order)
 * @param lines       the player's logs for this team (games with no row = did not play)
 * @param opts.joinedAfter  last date the player logged a game for ANOTHER team this season;
 *                    team games on/before it are "not-with-team", not missed
 * @param opts.currentInjury  label for an absence that runs to the latest game (e.g. "Out — Knee")
 */
export function plusMinusTrend(
  slots: TeamGameSlot[],
  lines: PlayerGameLine[],
  opts: { window?: number; joinedAfter?: Date | null; currentInjury?: string | null } = {},
): PlusMinusTrend {
  const window = opts.window ?? PM_WINDOWS[0];
  const byGame = new Map(lines.map((l) => [l.gameId, l]));
  const ordered = [...slots].sort((a, b) => a.date.getTime() - b.date.getTime());

  const played: PlayerGameLine[] = [];
  const points: PlusMinusPoint[] = ordered.map((s) => {
    const line = byGame.get(s.gameId);
    const base = { gameId: s.gameId, date: s.date, opponentAbbr: s.opponentAbbr, won: s.won };
    if (opts.joinedAfter && s.date.getTime() <= opts.joinedAfter.getTime() && !isPlayed(line)) {
      return { ...base, availability: "not-with-team" as const, minutes: null, plusMinus: null, rollingAvg: null, rollingPer36: null, windowGames: 0, missedReason: null };
    }
    if (!isPlayed(line)) {
      return {
        ...base,
        availability: "missed" as const,
        minutes: null,
        plusMinus: null,
        rollingAvg: null,
        rollingPer36: null,
        windowGames: 0,
        missedReason: line?.dnpReason ?? null,
      };
    }
    played.push(line!);
    const w = played.slice(-window);
    const pmSum = w.reduce((a, l) => a + (l.plusMinus ?? 0), 0);
    const minSum = w.reduce((a, l) => a + (l.minutes ?? 0), 0);
    return {
      ...base,
      availability: "played" as const,
      minutes: line!.minutes,
      plusMinus: line!.plusMinus,
      rollingAvg: pmSum / w.length,
      rollingPer36: minSum >= MIN_WINDOW_MINUTES ? (36 * pmSum) / minSum : null,
      windowGames: w.length,
      missedReason: null,
    };
  });

  // Contiguous absences; the trailing one is "ongoing" and can take the current injury label
  const absences: Absence[] = [];
  points.forEach((p, i) => {
    if (p.availability !== "missed") return;
    const prev = absences[absences.length - 1];
    if (prev && points[i - 1]?.availability === "missed") {
      prev.endGameId = p.gameId;
      prev.games += 1;
      prev.reason = prev.reason ?? p.missedReason;
    } else {
      absences.push({ startGameId: p.gameId, endGameId: p.gameId, games: 1, reason: p.missedReason, kind: "unknown", ongoing: false });
    }
  });
  for (const a of absences) a.kind = absenceKind(a.reason);
  const last = absences[absences.length - 1];
  if (last && points[points.length - 1]?.gameId === last.endGameId) {
    last.ongoing = true;
    if (opts.currentInjury) {
      last.reason = last.reason ?? opts.currentInjury;
      last.kind = absenceKind(last.reason, last.reason === opts.currentInjury);
      for (const p of points.slice(-last.games)) p.missedReason = p.missedReason ?? opts.currentInjury;
    }
  }

  const pmTotal = played.reduce((a, l) => a + (l.plusMinus ?? 0), 0);
  const minTotal = played.reduce((a, l) => a + (l.minutes ?? 0), 0);
  const lastPlayed = [...points].reverse().find((p) => p.availability === "played");
  const seasonAvg = played.length ? pmTotal / played.length : null;
  const lastAvg = lastPlayed?.rollingAvg ?? null;
  let trend: PlusMinusSummary["trend"] = null;
  if (seasonAvg != null && lastAvg != null && played.length > window) {
    const diff = lastAvg - seasonAvg;
    trend = diff >= PM_TREND_POINTS ? "up" : diff <= -PM_TREND_POINTS ? "down" : "flat";
  }

  return {
    points,
    summary: {
      gamesPlayed: played.length,
      gamesMissed: points.filter((p) => p.availability === "missed").length,
      seasonAvg,
      seasonPer36: minTotal >= MIN_WINDOW_MINUTES ? (36 * pmTotal) / minTotal : null,
      lastAvg,
      lastPer36: lastPlayed?.rollingPer36 ?? null,
      trend,
      absences,
    },
  };
}
