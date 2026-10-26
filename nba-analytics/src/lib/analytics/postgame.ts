/**
 * Post-game facts from a finished game's live feed (box score + play-by-play): quarter
 * splits, runs, swings, when the lead was taken for good, the closing stretch, and
 * consistency checks. Pure — scripts/postgame-data.ts fetches. See the postgame-report skill.
 */
import {
  buildLiveGame,
  elapsedSeconds,
  isScore,
  parseClock,
  periodLabel,
  scoringEvents,
  type LiveGameData,
  type RawLiveAction,
  type RawLiveBoxScore,
  type Scored,
} from "./live";

export interface PeriodLine {
  period: string;
  pts: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  tov: number;
  oreb: number;
  pf: number;
}

export interface Stretch {
  /** points for minus points against over the stretch, from the side's view */
  net: number;
  from: string;
  to: string;
  /** focus–opponent score before and after */
  fromScore: string;
  toScore: string;
}

export interface PostgameFacts {
  game: LiveGameData;
  final: boolean;
  /** per team tricode, one line per period */
  periods: Record<string, PeriodLine[]>;
  /** focus–opponent score at the end of each period and at 6:00 / 2:00 marks */
  checkpoints: { at: string; score: string }[];
  /** unanswered runs of `minRun`+ points, in game order */
  runs: { tricode: string; points: number; since: string }[];
  bestStretch: Record<string, Stretch | null>;
  /** focus team's go-ahead score it never gave back; null if it never led at the end */
  leadForGood: { at: string; score: string } | null;
  closing: { seconds: number; fromScore: string; focusPoints: number; oppPoints: number; focusScorers: Record<string, number> };
  /** points per period for the focus team's top scorers */
  scorerPeriods: { name: string; byPeriod: number[] }[];
  /** consistency failures; empty when everything adds up */
  checks: string[];
  /** non-fatal notes, e.g. made shots later taken back by a score correction */
  warnings: string[];
}

const pointsOf = (a: RawLiveAction) =>
  a.shotResult !== "Made" ? 0 : a.actionType === "3pt" ? 3 : a.actionType === "freethrow" ? 1 : 2;

const ordered = (actions: RawLiveAction[]) => [...actions].sort((a, b) => a.orderNumber - b.orderNumber);

export function periodSplits(actions: RawLiveAction[], tricodes: string[], periods: number, regulation = 4): Record<string, PeriodLine[]> {
  const out: Record<string, PeriodLine[]> = {};
  for (const t of tricodes) {
    out[t] = Array.from({ length: periods }, (_, i) => ({
      period: periodLabel(i + 1, regulation), pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, tov: 0, oreb: 0, pf: 0,
    }));
  }
  for (const a of actions) {
    const line = a.teamTricode ? out[a.teamTricode]?.[a.period - 1] : undefined;
    if (!line) continue;
    const made = a.shotResult === "Made";
    if (a.isFieldGoal === 1) {
      line.fga++;
      if (made) line.fgm++;
      if (a.actionType === "3pt") { line.fg3a++; if (made) line.fg3m++; }
    }
    if (a.actionType === "freethrow") { line.fta++; if (made) line.ftm++; }
    line.pts += pointsOf(a);
    if (a.actionType === "turnover") line.tov++;
    // team rebounds have no personId; the box score's OREB counts players only
    if (a.actionType === "rebound" && a.subType === "offensive" && a.personId) line.oreb++;
    if (a.actionType === "foul") line.pf++;
  }
  return out;
}

/**
 * Points per period from the score fields (what the scoreboard said), not from made shots —
 * so an overturned basket that stays "Made" in the feed doesn't count.
 */
export function periodPoints(events: Scored[], periods: number, regulation = 4): { home: number[]; away: number[] } {
  const out = { home: [] as number[], away: [] as number[] };
  let prev = { home: 0, away: 0 };
  for (let p = 1; p <= periods; p++) {
    const end = elapsedSeconds(p, 0, regulation);
    const last = events.filter((e) => e.elapsed <= end).pop();
    const now = { home: last?.home ?? prev.home, away: last?.away ?? prev.away };
    out.home.push(now.home - prev.home);
    out.away.push(now.away - prev.away);
    prev = now;
  }
  return out;
}

/** Clock marks (seconds left) to report for a period: halves, plus late-game marks in Q4 and the final period. */
export function checkpointMarks(period: number, periods: number, regulation = 4): number[] {
  if (period > regulation) return period === periods ? [120, 0] : [0]; // a 5-minute overtime has no 6:00
  if (period === regulation) return [360, 120, 0];
  return period % 2 === 0 ? [360, 0] : [0];
}

const scoreLine = (e: Scored | undefined, focusIsHome: boolean) =>
  e ? (focusIsHome ? `${e.home}-${e.away}` : `${e.away}-${e.home}`) : "0-0";
const focusMargin = (e: Scored, focusIsHome: boolean) => (focusIsHome ? e.home - e.away : e.away - e.home);

export function unansweredRuns(events: Scored[], tricodes: { home: string; away: string }, minRun = 7) {
  const runs: PostgameFacts["runs"] = [];
  let side: "home" | "away" | null = null;
  let points = 0;
  let since = "";
  const flush = () => { if (side && points >= minRun) runs.push({ tricode: tricodes[side], points, since }); };
  for (const e of events.filter(isScore)) {
    if (e.side === side) { points += e.points; continue; }
    flush();
    side = e.side;
    points = e.points;
    since = e.label;
  }
  flush();
  return runs;
}

/** The side's best net-scoring stretch between any two scores (e.g. a 45–18 run over a quarter and a half). */
export function bestStretch(events: Scored[], forHome: boolean, focusIsHome: boolean): Stretch | null {
  const sign = forHome ? 1 : -1;
  let best: Stretch | null = null;
  for (let i = 0; i < events.length; i++) {
    const startMargin = i ? events[i - 1].home - events[i - 1].away : 0;
    for (let j = i; j < events.length; j++) {
      const net = sign * (events[j].home - events[j].away - startMargin);
      if (net > (best?.net ?? 0)) {
        best = { net, from: events[i].label, to: events[j].label, fromScore: scoreLine(events[i - 1], focusIsHome), toScore: scoreLine(events[j], focusIsHome) };
      }
    }
  }
  return best;
}

export function leadForGood(events: Scored[], focusIsHome: boolean): PostgameFacts["leadForGood"] {
  if (!events.length || focusMargin(events[events.length - 1], focusIsHome) <= 0) return null;
  let i = events.length - 1;
  while (i > 0 && focusMargin(events[i - 1], focusIsHome) > 0) i--;
  return { at: events[i].label, score: scoreLine(events[i], focusIsHome) };
}

export function closingStretch(actions: RawLiveAction[], events: Scored[], opts: { focusTricode: string; focusIsHome: boolean; lastPeriod: number; seconds?: number; regulation?: number }): PostgameFacts["closing"] {
  const seconds = opts.seconds ?? 300;
  const regulation = opts.regulation ?? 4;
  const start = elapsedSeconds(opts.lastPeriod, seconds, regulation);
  const before = events.filter((e) => e.elapsed < start).pop();
  const end = events[events.length - 1];
  const focusPoints = (e: Scored | undefined) => (e ? (opts.focusIsHome ? e.home : e.away) : 0);
  const oppPoints = (e: Scored | undefined) => (e ? (opts.focusIsHome ? e.away : e.home) : 0);
  const focusScorers: Record<string, number> = {};
  for (const a of actions) {
    if (a.period !== opts.lastPeriod || a.teamTricode !== opts.focusTricode || (parseClock(a.clock) ?? 0) > seconds) continue;
    const p = pointsOf(a);
    if (p && a.playerNameI) focusScorers[a.playerNameI] = (focusScorers[a.playerNameI] ?? 0) + p;
  }
  return {
    seconds,
    fromScore: scoreLine(before, opts.focusIsHome),
    focusPoints: focusPoints(end) - focusPoints(before),
    oppPoints: oppPoints(end) - oppPoints(before),
    focusScorers,
  };
}

export function buildPostgame(box: RawLiveBoxScore, actions: RawLiveAction[], focusTeamId: string, fetchedAt: Date): PostgameFacts {
  const game = buildLiveGame(box, actions, focusTeamId, fetchedAt);
  const regulation = game.regulationPeriods;
  const focusIsHome = game.focus.isHome;
  const acts = ordered(actions);
  const events = scoringEvents(acts, regulation);
  const nPeriods = Math.max(game.focus.periods.length, regulation);
  const tricodes = { home: focusIsHome ? game.focus.tricode : game.opponent.tricode, away: focusIsHome ? game.opponent.tricode : game.focus.tricode };
  const periods = periodSplits(acts, [game.focus.tricode, game.opponent.tricode], nPeriods, regulation);
  const warnings: string[] = [];
  const scored = periodPoints(events, nPeriods, regulation);
  for (const t of [game.focus, game.opponent]) {
    const fromScore = scored[t.isHome ? "home" : "away"];
    const fromShots = periods[t.tricode].reduce((s, l) => s + l.pts, 0);
    const fromScoreTotal = fromScore.reduce((a, b) => a + b, 0);
    if (fromShots !== fromScoreTotal) {
      warnings.push(`${t.tricode}: made shots add up to ${fromShots}, the score to ${fromScoreTotal} — a score correction (e.g. overturned basket); period points use the score`);
    }
    periods[t.tricode].forEach((line, i) => (line.pts = fromScore[i]));
  }

  const checkpoints: PostgameFacts["checkpoints"] = [];
  for (let p = 1; p <= nPeriods; p++) {
    for (const clock of checkpointMarks(p, nPeriods, regulation)) {
      const t = elapsedSeconds(p, clock, regulation);
      const last = events.filter((e) => e.elapsed <= t).pop();
      checkpoints.push({ at: clock ? `${periodLabel(p, regulation)} ${clock / 60}:00` : `End ${periodLabel(p, regulation)}`, score: scoreLine(last, focusIsHome) });
    }
  }

  const top = [...game.focus.players].sort((a, b) => b.pts - a.pts).slice(0, 3);
  const scorerPeriods = top.map((p) => ({
    name: p.name,
    byPeriod: Array.from({ length: nPeriods }, (_, i) =>
      acts.filter((a) => String(a.personId) === p.personId && a.period === i + 1).reduce((s, a) => s + pointsOf(a), 0)),
  }));

  const checks: string[] = [];
  for (const t of [game.focus, game.opponent]) {
    const byQuarter = t.periods.reduce((s, x) => s + x, 0);
    if (byQuarter !== t.score) checks.push(`${t.tricode}: periods sum to ${byQuarter}, final is ${t.score}`);
    const byPlayer = t.players.reduce((s, p) => s + p.pts, 0);
    if (byPlayer !== t.score) checks.push(`${t.tricode}: player points sum to ${byPlayer}, final is ${t.score}`);
    const fromPbp = periods[t.tricode].reduce((s, l) => s + l.pts, 0);
    if (fromPbp !== t.score) checks.push(`${t.tricode}: play-by-play score adds up to ${fromPbp}, final is ${t.score}`);
  }
  for (const s of scorerPeriods) {
    const p = top.find((x) => x.name === s.name)!;
    const sum = s.byPeriod.reduce((a, b) => a + b, 0);
    // a player's made shots can include a basket later taken back; the box score is authoritative
    if (sum !== p.pts) warnings.push(`${s.name}: made shots add up to ${sum}, box score ${p.pts} — quarter split may include a corrected basket`);
  }

  return {
    game,
    final: box.gameStatus === 3,
    periods,
    checkpoints,
    runs: unansweredRuns(events, tricodes),
    bestStretch: {
      [game.focus.tricode]: bestStretch(events, focusIsHome, focusIsHome),
      [game.opponent.tricode]: bestStretch(events, !focusIsHome, focusIsHome),
    },
    leadForGood: leadForGood(events, focusIsHome),
    closing: closingStretch(acts, events, { focusTricode: game.focus.tricode, focusIsHome, lastPeriod: nPeriods, regulation }),
    scorerPeriods,
    checks,
    warnings,
  };
}
