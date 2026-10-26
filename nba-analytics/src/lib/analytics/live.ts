/**
 * In-game metrics from the NBA live feed (cdn.nba.com liveData: boxscore + playbyplay).
 * Pure: the /api/live route fetches, this module shapes. Formulas are the same box-score
 * estimates as teamProfiles.ts, applied to one game in progress — see the basketball-metrics
 * skill, "Live game".
 */
import { efg, orebPct, possessions, tovPct, type SideTotals } from "./teamProfiles";
import { trueShooting } from "./form";

// ── Raw feed (only the fields we read) ───────────────────────────────────────

export interface RawLivePlayerStats {
  assists: number;
  blocks: number;
  fieldGoalsAttempted: number;
  fieldGoalsMade: number;
  foulsPersonal: number;
  foulsTechnical: number;
  freeThrowsAttempted: number;
  freeThrowsMade: number;
  minutes: string;
  plusMinusPoints: number;
  points: number;
  reboundsDefensive: number;
  reboundsOffensive: number;
  reboundsTotal: number;
  steals: number;
  threePointersAttempted: number;
  threePointersMade: number;
  turnovers: number;
}

export interface RawLivePlayer {
  personId: number;
  name: string;
  nameI: string;
  jerseyNum?: string;
  position?: string;
  starter: string;
  oncourt: string;
  played: string;
  status: string;
  notPlayingReason?: string;
  notPlayingDescription?: string;
  statistics: RawLivePlayerStats;
}

export interface RawLiveTeamStats {
  points: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  threePointersMade: number;
  threePointersAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  reboundsOffensive: number;
  reboundsDefensive: number;
  reboundsTotal: number;
  assists: number;
  steals: number;
  blocks: number;
  /** player + team turnovers (shot-clock violations etc.) — what LeagueGameLog's TOV counts */
  turnoversTotal: number;
  foulsPersonal: number;
  pointsInThePaint: number;
  pointsSecondChance: number;
  pointsFastBreak: number;
  pointsFromTurnovers: number;
  benchPoints: number;
  leadChanges: number;
  timesTied: number;
}

export interface RawLiveTeam {
  teamId: number;
  teamName: string;
  teamCity: string;
  teamTricode: string;
  score: number;
  inBonus: string | number | null;
  timeoutsRemaining: number | null;
  periods: { period: number; score: number }[];
  players: RawLivePlayer[];
  statistics: RawLiveTeamStats;
}

export interface RawLiveBoxScore {
  gameId: string;
  gameStatus: number;
  gameStatusText: string;
  period: number;
  gameClock: string;
  gameTimeUTC: string;
  regulationPeriods: number;
  arena?: { arenaName?: string; arenaCity?: string };
  homeTeam: RawLiveTeam;
  awayTeam: RawLiveTeam;
}

export interface RawLiveAction {
  actionNumber: number;
  orderNumber: number;
  period: number;
  clock: string;
  actionType: string;
  subType?: string;
  teamTricode?: string;
  personId?: number;
  playerNameI?: string;
  isFieldGoal?: number;
  shotResult?: string;
  shotDistance?: number;
  xLegacy?: number;
  yLegacy?: number;
  description?: string;
  scoreHome?: string;
  scoreAway?: string;
}

// ── Output ───────────────────────────────────────────────────────────────────

export type FoulStatus = "trouble" | "fouled-out";

export interface LivePlayerLine {
  personId: string;
  name: string;
  nameI: string;
  jersey: string | null;
  position: string | null;
  starter: boolean;
  onCourt: boolean;
  played: boolean;
  /** inactive / not with team tonight; reason from the feed when given */
  inactive: boolean;
  inactiveReason: string | null;
  headshotUrl: string;
  minutes: number;
  pts: number;
  reb: number;
  oreb: number;
  dreb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  plusMinus: number;
  tsPct: number | null;
  foul: FoulStatus | null;
}

export interface LiveTeamFactors {
  /** this team's box-score possessions so far; game pace uses the mean of both teams */
  possessions: number | null;
  offRtg: number | null;
  efgPct: number | null;
  tovPct: number | null;
  orebPct: number | null;
  ftRate: number | null;
  tsPct: number | null;
  threePaRate: number | null;
  fgPct: number | null;
  threePct: number | null;
  ftPct: number | null;
}

export interface LiveLineupStint {
  playerIds: string[];
  /** when this five came together, or the start of the period if it started it ("Q3 12:00") */
  since: string;
  seconds: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface LiveTeamView {
  teamId: string;
  tricode: string;
  city: string;
  name: string;
  score: number;
  isHome: boolean;
  /** points per period, index 0 = Q1 */
  periods: number[];
  timeoutsRemaining: number | null;
  inBonus: boolean | null;
  totals: {
    fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number;
    oreb: number; dreb: number; reb: number; ast: number; stl: number; blk: number; tov: number; pf: number;
  };
  factors: LiveTeamFactors;
  scoring: { paint: number; secondChance: number; fastBreak: number; offTurnovers: number; bench: number };
  /** from the play-by-play (the feed's own lead/run/time-leading fields only update at period breaks) */
  biggestLead: number;
  longestRun: number;
  timeLeadingSec: number;
  players: LivePlayerLine[];
  lineup: LiveLineupStint | null;
}

export interface MarginPoint {
  /** game seconds elapsed */
  t: number;
  /** focus team minus opponent */
  margin: number;
  label: string;
}

export interface LiveRun {
  tricode: string;
  points: number;
  since: string;
}

export interface LiveShot {
  id: number;
  tricode: string;
  personId: string;
  player: string;
  made: boolean;
  isThree: boolean;
  /** stats.nba.com shot-chart coordinates (tenths of feet, basket at 0,0) */
  x: number;
  y: number;
  distance: number | null;
  period: number;
  clock: string;
  description: string;
}

export interface LivePlay {
  id: number;
  period: number;
  clock: string;
  tricode: string | null;
  description: string;
  /** "away-home" after the play */
  score: string | null;
  scoring: boolean;
}

export interface LiveGameData {
  gameId: string;
  /** 1 = scheduled, 2 = in progress, 3 = final */
  status: number;
  statusText: string;
  period: number;
  clock: string | null;
  elapsedSec: number;
  regulationPeriods: number;
  tipoffUtc: string;
  arena: string | null;
  focus: LiveTeamView;
  opponent: LiveTeamView;
  /** mean of both teams' possessions so far */
  gamePossessions: number | null;
  leadChanges: number;
  timesTied: number;
  margin: MarginPoint[];
  run: LiveRun | null;
  shots: LiveShot[];
  recentPlays: LivePlay[];
  fetchedAt: string;
}

// ── Clock helpers ────────────────────────────────────────────────────────────

const REG_PERIOD_SEC = 12 * 60;
const OT_PERIOD_SEC = 5 * 60;

/** "PT09M24.00S" → 564. null for an empty / unparseable clock (halftime, final). */
export function parseClock(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /^PT(\d+)M([\d.]+)S$/.exec(iso);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function formatClock(sec: number | null): string | null {
  if (sec == null) return null;
  const whole = Math.ceil(sec - 1e-9);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function periodLabel(period: number, regulation = 4): string {
  if (period <= regulation) return `Q${period}`;
  const ot = period - regulation;
  return ot === 1 ? "OT" : `${ot}OT`;
}

function periodLength(period: number, regulation: number): number {
  return period <= regulation ? REG_PERIOD_SEC : OT_PERIOD_SEC;
}

/** Game seconds elapsed at `clockSec` remaining in `period`. */
export function elapsedSeconds(period: number, clockSec: number, regulation = 4): number {
  let before = 0;
  for (let p = 1; p < period; p++) before += periodLength(p, regulation);
  return before + (periodLength(period, regulation) - clockSec);
}

// ── Player rules ─────────────────────────────────────────────────────────────

/**
 * Coaching rule of thumb: 2 fouls in Q1, 3 in Q2, 4 in Q3, 5 in Q4/OT is "foul trouble";
 * 6 personal fouls is a disqualification.
 */
export function foulStatus(pf: number, period: number): FoulStatus | null {
  if (pf >= 6) return "fouled-out";
  const threshold = Math.min(Math.max(period, 1) + 1, 5);
  return pf >= threshold ? "trouble" : null;
}

function playerLine(p: RawLivePlayer, period: number): LivePlayerLine {
  const s = p.statistics;
  const clock = parseClock(s.minutes);
  return {
    personId: String(p.personId),
    name: p.name,
    nameI: p.nameI,
    jersey: p.jerseyNum || null,
    position: p.position || null,
    starter: p.starter === "1",
    onCourt: p.oncourt === "1",
    played: p.played === "1",
    inactive: p.status !== "ACTIVE",
    inactiveReason: p.notPlayingDescription || p.notPlayingReason || null,
    headshotUrl: `https://cdn.nba.com/headshots/nba/latest/1040x760/${p.personId}.png`,
    minutes: clock == null ? 0 : clock / 60,
    pts: s.points,
    reb: s.reboundsTotal,
    oreb: s.reboundsOffensive,
    dreb: s.reboundsDefensive,
    ast: s.assists,
    stl: s.steals,
    blk: s.blocks,
    tov: s.turnovers,
    pf: s.foulsPersonal,
    fgm: s.fieldGoalsMade,
    fga: s.fieldGoalsAttempted,
    fg3m: s.threePointersMade,
    fg3a: s.threePointersAttempted,
    ftm: s.freeThrowsMade,
    fta: s.freeThrowsAttempted,
    plusMinus: s.plusMinusPoints,
    tsPct: trueShooting(s.points, s.fieldGoalsAttempted, s.freeThrowsAttempted),
    foul: foulStatus(s.foulsPersonal, period),
  };
}

// ── Team factors ─────────────────────────────────────────────────────────────

function totalsOf(t: RawLiveTeamStats): SideTotals {
  return {
    pts: t.points,
    fgm: t.fieldGoalsMade,
    fga: t.fieldGoalsAttempted,
    fg3m: t.threePointersMade,
    fg3a: t.threePointersAttempted,
    ftm: t.freeThrowsMade,
    fta: t.freeThrowsAttempted,
    oreb: t.reboundsOffensive,
    dreb: t.reboundsDefensive,
    tov: t.turnoversTotal,
    poss: 0,
    possPts: 0,
    possGames: 0,
  };
}

const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

/** One team's in-game four factors and rating, measured on the game's mean possessions. */
export function liveFactors(team: RawLiveTeamStats, opp: RawLiveTeamStats): LiveTeamFactors {
  const t = totalsOf(team);
  const o = totalsOf(opp);
  const own = possessions(t);
  const theirs = possessions(o);
  const gamePoss = own != null && theirs != null ? (own + theirs) / 2 : null;
  return {
    possessions: own,
    offRtg: gamePoss != null && gamePoss > 0 ? (100 * t.pts) / gamePoss : null,
    efgPct: efg(t),
    tovPct: tovPct(t),
    orebPct: orebPct(t, o),
    ftRate: div(t.fta, t.fga),
    tsPct: trueShooting(t.pts, t.fga, t.fta),
    threePaRate: div(t.fg3a, t.fga),
    fgPct: div(t.fgm, t.fga),
    threePct: div(t.fg3m, t.fg3a),
    ftPct: div(t.ftm, t.fta),
  };
}

// ── Play-by-play derived ─────────────────────────────────────────────────────

export interface Scored {
  order: number;
  elapsed: number;
  home: number;
  away: number;
  label: string;
  /** which side the points went to, and how many */
  side: "home" | "away";
  points: number;
  /** a score taken back (overturned basket, scorer's fix): moves the margin, scores nothing */
  correction: boolean;
}

/** A real score that still stands (corrections and retracted baskets don't count toward runs). */
export const isScore = (e: Scored) => !e.correction && e.points > 0;

/** Take `points` back from `side`'s latest scoring events. */
function retract(events: Scored[], side: "home" | "away", points: number) {
  for (let i = events.length - 1; i >= 0 && points > 0; i--) {
    const e = events[i];
    if (e.side !== side || !isScore(e)) continue;
    const taken = Math.min(e.points, points);
    e.points -= taken;
    points -= taken;
  }
}

function orderActions(actions: RawLiveAction[]): RawLiveAction[] {
  return [...actions].sort((a, b) => a.orderNumber - b.orderNumber);
}

function actionElapsed(a: RawLiveAction, regulation: number): number {
  return elapsedSeconds(a.period, parseClock(a.clock) ?? 0, regulation);
}

function stamp(a: RawLiveAction, regulation: number): string {
  return `${periodLabel(a.period, regulation)} ${formatClock(parseClock(a.clock)) ?? ""}`.trim();
}

/** Every change of score, in game order. */
export function scoringEvents(actions: RawLiveAction[], regulation = 4): Scored[] {
  const out: Scored[] = [];
  let home = 0;
  let away = 0;
  for (const a of orderActions(actions)) {
    if (a.scoreHome == null || a.scoreAway == null) continue;
    const h = Number(a.scoreHome);
    const w = Number(a.scoreAway);
    if (Number.isNaN(h) || Number.isNaN(w) || (h === home && w === away)) continue;
    const deltas = { home: h - home, away: w - away };
    home = h;
    away = w;
    const base = { order: a.orderNumber, elapsed: actionElapsed(a, regulation), home, away, label: stamp(a, regulation) };
    for (const side of ["home", "away"] as const) {
      if (deltas[side] < 0) {
        retract(out, side, -deltas[side]);
        out.push({ ...base, side, points: 0, correction: true });
      } else if (deltas[side] > 0) {
        out.push({ ...base, side, points: deltas[side], correction: false });
      }
    }
  }
  return out;
}

/** Focus-team margin after every score, starting from 0 at tip-off. */
export function marginTimeline(events: Scored[], focusIsHome: boolean): MarginPoint[] {
  const pts: MarginPoint[] = [{ t: 0, margin: 0, label: "Tip-off" }];
  for (const e of events) {
    pts.push({ t: e.elapsed, margin: focusIsHome ? e.home - e.away : e.away - e.home, label: e.label });
  }
  return pts;
}

/** Unanswered points by the team that scored last (e.g. a 9–0 run). null before any score. */
export function currentRun(events: Scored[], tricodes: { home: string; away: string }): LiveRun | null {
  const scored = events.filter(isScore);
  if (!scored.length) return null;
  const side = scored[scored.length - 1].side;
  let points = 0;
  let start = scored[scored.length - 1];
  for (let i = scored.length - 1; i >= 0 && scored[i].side === side; i--) {
    points += scored[i].points;
    start = scored[i];
  }
  return { tricode: tricodes[side], points, since: start.label };
}

export interface LeadSummary {
  biggestLead: number;
  longestRun: number;
  timeLeadingSec: number;
}

/** Biggest lead, longest unanswered run and time spent ahead, per side, up to `elapsedNow`. */
export function leadSummary(events: Scored[], elapsedNow: number): { home: LeadSummary; away: LeadSummary } {
  const home: LeadSummary = { biggestLead: 0, longestRun: 0, timeLeadingSec: 0 };
  const away: LeadSummary = { biggestLead: 0, longestRun: 0, timeLeadingSec: 0 };
  let run = 0;
  let runSide: "home" | "away" | null = null;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const margin = e.home - e.away;
    home.biggestLead = Math.max(home.biggestLead, margin);
    away.biggestLead = Math.max(away.biggestLead, -margin);
    if (isScore(e)) {
      run = e.side === runSide ? run + e.points : e.points;
      runSide = e.side;
      const side = e.side === "home" ? home : away;
      side.longestRun = Math.max(side.longestRun, run);
    }
    const until = i + 1 < events.length ? events[i + 1].elapsed : Math.max(elapsedNow, e.elapsed);
    if (margin > 0) home.timeLeadingSec += until - e.elapsed;
    else if (margin < 0) away.timeLeadingSec += until - e.elapsed;
  }
  return { home, away };
}

/**
 * The current five's stint: from the team's last substitution in this period, or the
 * period start if the five started the period, to now. Margin is from the team's side.
 */
export function lineupStint(
  actions: RawLiveAction[],
  opts: { tricode: string; isHome: boolean; onCourtIds: string[]; period: number; elapsedNow: number; regulation?: number },
): LiveLineupStint | null {
  const regulation = opts.regulation ?? 4;
  if (opts.onCourtIds.length !== 5) return null;
  const ordered = orderActions(actions);
  const inPeriod = ordered.filter((a) => a.period === opts.period);
  if (!inPeriod.length) return null;
  const lastSub = [...inPeriod].reverse().find((a) => a.actionType === "substitution" && a.teamTricode === opts.tricode);
  const start = lastSub ?? inPeriod.find((a) => a.actionType === "period") ?? inPeriod[0];

  // Score at the start of the stint = last known score at or before it
  let home = 0;
  let away = 0;
  let nowHome = 0;
  let nowAway = 0;
  for (const a of ordered) {
    if (a.scoreHome == null || a.scoreAway == null) continue;
    if (a.orderNumber <= start.orderNumber) {
      home = Number(a.scoreHome);
      away = Number(a.scoreAway);
    }
    nowHome = Number(a.scoreHome);
    nowAway = Number(a.scoreAway);
  }
  const forDelta = opts.isHome ? nowHome - home : nowAway - away;
  const againstDelta = opts.isHome ? nowAway - away : nowHome - home;
  return {
    playerIds: [...opts.onCourtIds].sort(),
    since: stamp(start, regulation),
    seconds: Math.max(0, opts.elapsedNow - actionElapsed(start, regulation)),
    pointsFor: forDelta,
    pointsAgainst: againstDelta,
  };
}

export function shotsFrom(actions: RawLiveAction[]): LiveShot[] {
  return orderActions(actions)
    .filter((a) => a.isFieldGoal === 1 && a.xLegacy != null && a.yLegacy != null && a.teamTricode && a.personId)
    .map((a) => ({
      id: a.actionNumber,
      tricode: a.teamTricode!,
      personId: String(a.personId),
      player: a.playerNameI ?? "",
      made: a.shotResult === "Made",
      isThree: a.actionType === "3pt",
      x: a.xLegacy!,
      y: a.yLegacy!,
      distance: a.shotDistance ?? null,
      period: a.period,
      clock: formatClock(parseClock(a.clock)) ?? "",
      description: a.description ?? "",
    }));
}

const QUIET_ACTIONS = new Set(["substitution", "period", "game"]);

export function recentPlays(actions: RawLiveAction[], n = 15): LivePlay[] {
  const ordered = orderActions(actions);
  const out: LivePlay[] = [];
  let prev: { home: number; away: number } | null = null;
  for (const a of ordered) {
    const score = a.scoreHome != null && a.scoreAway != null ? `${a.scoreAway}-${a.scoreHome}` : null;
    let scoring = false;
    if (score != null) {
      const now = { home: Number(a.scoreHome), away: Number(a.scoreAway) };
      // only points added count; a score taken back is a correction, not a scoring play
      scoring = prev != null && (now.home > prev.home || now.away > prev.away);
      prev = now;
    }
    if (QUIET_ACTIONS.has(a.actionType) || !a.description) continue;
    out.push({
      id: a.actionNumber,
      period: a.period,
      clock: formatClock(parseClock(a.clock)) ?? "",
      tricode: a.teamTricode ?? null,
      description: a.description,
      score,
      scoring,
    });
  }
  return out.slice(-n).reverse();
}

// ── Assembly ─────────────────────────────────────────────────────────────────

function bonusFlag(v: string | number | null): boolean | null {
  if (v == null || v === "") return null;
  return String(v) === "1";
}

function teamView(
  t: RawLiveTeam,
  opp: RawLiveTeam,
  isHome: boolean,
  leads: LeadSummary,
  ctx: { actions: RawLiveAction[]; period: number; elapsedNow: number; regulation: number; live: boolean },
): LiveTeamView {
  const s = t.statistics;
  const players = t.players.map((p) => playerLine(p, ctx.period));
  const onCourtIds = players.filter((p) => p.onCourt).map((p) => p.personId);
  return {
    teamId: String(t.teamId),
    tricode: t.teamTricode,
    city: t.teamCity,
    name: t.teamName,
    score: t.score,
    isHome,
    periods: [...t.periods].sort((a, b) => a.period - b.period).map((p) => p.score),
    timeoutsRemaining: t.timeoutsRemaining ?? null,
    inBonus: bonusFlag(t.inBonus),
    totals: {
      fgm: s.fieldGoalsMade, fga: s.fieldGoalsAttempted,
      fg3m: s.threePointersMade, fg3a: s.threePointersAttempted,
      ftm: s.freeThrowsMade, fta: s.freeThrowsAttempted,
      oreb: s.reboundsOffensive, dreb: s.reboundsDefensive, reb: s.reboundsTotal,
      ast: s.assists, stl: s.steals, blk: s.blocks, tov: s.turnoversTotal, pf: s.foulsPersonal,
    },
    factors: liveFactors(s, opp.statistics),
    scoring: {
      paint: s.pointsInThePaint,
      secondChance: s.pointsSecondChance,
      fastBreak: s.pointsFastBreak,
      offTurnovers: s.pointsFromTurnovers,
      bench: s.benchPoints,
    },
    ...leads,
    players,
    lineup: ctx.live
      ? lineupStint(ctx.actions, { tricode: t.teamTricode, isHome, onCourtIds, period: ctx.period, elapsedNow: ctx.elapsedNow, regulation: ctx.regulation })
      : null,
  };
}

export function buildLiveGame(box: RawLiveBoxScore, actions: RawLiveAction[], focusTeamId: string, fetchedAt: Date): LiveGameData {
  const focusIsHome = String(box.homeTeam.teamId) === focusTeamId;
  const regulation = box.regulationPeriods || 4;
  const clockSec = parseClock(box.gameClock);
  const live = box.gameStatus === 2;
  const elapsedNow = box.gameStatus === 3
    ? elapsedSeconds(Math.max(box.period, regulation), 0, regulation)
    : elapsedSeconds(Math.max(box.period, 1), clockSec ?? 0, regulation);
  const ctx = { actions, period: box.period, elapsedNow, regulation, live };

  const events = scoringEvents(actions, regulation);
  const leads = leadSummary(events, elapsedNow);
  const home = teamView(box.homeTeam, box.awayTeam, true, leads.home, ctx);
  const away = teamView(box.awayTeam, box.homeTeam, false, leads.away, ctx);
  const homePoss = home.factors.possessions;
  const awayPoss = away.factors.possessions;

  return {
    gameId: box.gameId,
    status: box.gameStatus,
    statusText: box.gameStatusText.trim(),
    period: box.period,
    clock: formatClock(clockSec),
    elapsedSec: elapsedNow,
    regulationPeriods: regulation,
    tipoffUtc: box.gameTimeUTC,
    arena: [box.arena?.arenaName, box.arena?.arenaCity].filter(Boolean).join(", ") || null,
    focus: focusIsHome ? home : away,
    opponent: focusIsHome ? away : home,
    gamePossessions: homePoss != null && awayPoss != null ? (homePoss + awayPoss) / 2 : null,
    leadChanges: box.homeTeam.statistics.leadChanges,
    timesTied: box.homeTeam.statistics.timesTied,
    margin: marginTimeline(events, focusIsHome),
    run: currentRun(events, { home: home.tricode, away: away.tricode }),
    shots: shotsFrom(actions),
    recentPlays: recentPlays(actions),
    fetchedAt: fetchedAt.toISOString(),
  };
}
