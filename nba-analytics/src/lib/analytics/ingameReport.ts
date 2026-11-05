/**
 * In-game checkpoint reports: twice a period (the midpoint and the end), a snapshot of the game
 * rebuilt from the play-by-play as it stood at that moment — score, the segment since the last
 * checkpoint, four factors, who did the damage, runs, foul trouble, and how the four factors
 * compare with each team's season. Pure: /api/live/reports fetches the feed and the season
 * baseline. Spec: basketball-metrics skill → "In-game checkpoint reports".
 */
import {
  elapsedSeconds,
  foulStatus,
  formatClock,
  isScore,
  parseClock,
  periodLabel,
  scoringEvents,
  type RawLiveAction,
  type Scored,
} from "./live";
import { possessions } from "./teamProfiles";
import { fmtNum, fmtPct } from "@/lib/format";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CheckpointMark {
  /** "q1-mid", "q1-end", "ot1-mid", … */
  id: string;
  /** "Q1 6:00", "End of Q1" */
  label: string;
  period: number;
  /** seconds left in the period at the mark */
  clockSec: number;
  /** game seconds elapsed at the mark */
  elapsed: number;
}

/** One team's box score over a stretch of the game, rebuilt from the play-by-play. */
export interface StretchSide {
  tricode: string;
  /** from the score fields (what the scoreboard said), not from made shots */
  pts: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  /** player rebounds only, like the live box score */
  oreb: number;
  dreb: number;
  /** player + team turnovers */
  tov: number;
  ast: number;
  stl: number;
  blk: number;
  pf: number;
  /** this team's box-score possessions in the stretch */
  poss: number | null;
  /** 100 · PTS / mean(both teams' possessions); null until there are possessions */
  offRtg: number | null;
  efgPct: number | null;
  tovPct: number | null;
  orebPct: number | null;
  ftRate: number | null;
  threePct: number | null;
}

export interface StretchPlayer {
  personId: string;
  name: string;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
}

export interface CheckpointRun {
  tricode: string;
  points: number;
  /** e.g. "Q2 9:14" */
  since: string;
  until: string;
}

export interface FoulTroubleEntry {
  personId: string;
  name: string;
  tricode: string;
  fouls: number;
  status: "trouble" | "fouled-out";
}

/** Four-factor keys: tonight so far vs the team's season. */
export type KeyMetric = "efgPct" | "tovPct" | "orebPct" | "ftRate";

export interface SeasonFactors {
  efgPct: number | null;
  tovPct: number | null;
  orebPct: number | null;
  ftRate: number | null;
  oppEfgPct: number | null;
  oppTovPct: number | null;
  oppOrebPct: number | null;
  oppFtRate: number | null;
}

export interface KeyCheck {
  metric: KeyMetric;
  /** "offense": the focus team's factor; "defense": what the opponent is doing against us */
  side: "offense" | "defense";
  label: string;
  /** lower-case phrase for headlines, e.g. "our TOV%" */
  short: string;
  tonight: number | null;
  /** the focus team's season value (its own factor, or what its defense allows) */
  season: number | null;
  /** the opponent's own season value for the same factor (what they usually do) */
  opponentSeason: number | null;
  /** tonight vs our season, from the focus team's point of view; null when either is missing */
  verdict: "better" | "worse" | "even" | null;
}

export interface CheckpointReport {
  id: string;
  label: string;
  period: number;
  /** "6:00" / "0:00" */
  clock: string;
  elapsed: number;
  score: { focus: number; opp: number };
  /** focus minus opponent */
  margin: number;
  segment: {
    /** label of the previous checkpoint, or "Tip-off" */
    from: string;
    focus: StretchSide;
    opp: StretchSide;
    focusPlayers: StretchPlayer[];
    oppPlayers: StretchPlayer[];
    /** unanswered runs (6+) that ended inside the segment */
    runs: CheckpointRun[];
  };
  game: {
    focus: StretchSide;
    opp: StretchSide;
    focusPlayers: StretchPlayer[];
    oppPlayers: StretchPlayer[];
  };
  foulTrouble: FoulTroubleEntry[];
  keys: KeyCheck[];
  /** short factual bullets, most important first */
  headlines: string[];
}

export interface ReportContext {
  focus: { tricode: string; isHome: boolean };
  opp: { tricode: string };
  regulation?: number;
  /** game seconds elapsed right now (the feed's clock), so future marks are left out */
  elapsedNow: number;
  /** personId → display name from the box score (falls back to the play-by-play's names) */
  names?: Map<string, string>;
  /** season four factors from the database; null when unavailable */
  season?: { focus: SeasonFactors | null; opp: SeasonFactors | null };
}

// ── Checkpoints ──────────────────────────────────────────────────────────────

const REG_SEC = 12 * 60;
const OT_SEC = 5 * 60;
/** Runs this long or longer are called out (same spirit as the post-game 7+, a bit more eager mid-game). */
export const MIN_REPORT_RUN = 6;
/** How many players per side the report lists. */
const TOP_PLAYERS = 3;

/** Two marks per period: the midpoint (6:00 in a quarter, 2:30 in overtime) and the end. */
export function reportMarks(periods: number, regulation = 4): CheckpointMark[] {
  const marks: CheckpointMark[] = [];
  for (let p = 1; p <= periods; p++) {
    const len = p <= regulation ? REG_SEC : OT_SEC;
    const tag = p <= regulation ? `q${p}` : `ot${p - regulation}`;
    const name = periodLabel(p, regulation);
    marks.push({ id: `${tag}-mid`, label: `${name} ${formatClock(len / 2)}`, period: p, clockSec: len / 2, elapsed: elapsedSeconds(p, len / 2, regulation) });
    marks.push({ id: `${tag}-end`, label: `End of ${name}`, period: p, clockSec: 0, elapsed: elapsedSeconds(p, 0, regulation) });
  }
  return marks;
}

/** Marks the game has reached by `elapsedNow`, plus the next one (null once it's over). */
export function reachedMarks(elapsedNow: number, currentPeriod: number, regulation = 4): { reached: CheckpointMark[]; next: CheckpointMark | null } {
  const all = reportMarks(Math.max(currentPeriod, regulation) + 1, regulation);
  const reached = all.filter((m) => m.elapsed <= elapsedNow + 1e-9);
  const next = all.find((m) => m.elapsed > elapsedNow + 1e-9 && m.period <= Math.max(currentPeriod, regulation)) ?? null;
  return { reached, next };
}

// ── Stretch box scores ───────────────────────────────────────────────────────

const ordered = (actions: RawLiveAction[]) => [...actions].sort((a, b) => a.orderNumber - b.orderNumber);
const elapsedOf = (a: RawLiveAction, regulation: number) => elapsedSeconds(a.period, parseClock(a.clock) ?? 0, regulation);
/** "heave" end-of-period heaves aren't counted as field-goal attempts in the box score */
const isFga = (a: RawLiveAction) => a.actionType === "2pt" || a.actionType === "3pt";
const pointsOf = (a: RawLiveAction) =>
  a.shotResult !== "Made" ? 0 : a.actionType === "3pt" ? 3 : a.actionType === "freethrow" ? 1 : 2;
const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

function emptySide(tricode: string): StretchSide {
  return {
    tricode, pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, tov: 0, ast: 0, stl: 0, blk: 0, pf: 0,
    poss: null, offRtg: null, efgPct: null, tovPct: null, orebPct: null, ftRate: null, threePct: null,
  };
}

function emptyPlayer(personId: string, name: string): StretchPlayer {
  return { personId, name, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0 };
}

/** Score (home, away) after the last scoring event at or before `t`. */
function scoreAt(events: Scored[], t: number): { home: number; away: number } {
  let last: Scored | undefined;
  for (const e of events) {
    if (e.elapsed > t) break;
    last = e;
  }
  return { home: last?.home ?? 0, away: last?.away ?? 0 };
}

interface Stretch {
  focus: StretchSide;
  opp: StretchSide;
  focusPlayers: StretchPlayer[];
  oppPlayers: StretchPlayer[];
}

/** Box score of both teams for plays with from < elapsed ≤ to (from < 0 includes tip-off). */
export function stretchBox(
  actions: RawLiveAction[],
  events: Scored[],
  from: number,
  to: number,
  ctx: Pick<ReportContext, "focus" | "opp" | "regulation" | "names">,
): Stretch {
  const regulation = ctx.regulation ?? 4;
  const sides = { [ctx.focus.tricode]: emptySide(ctx.focus.tricode), [ctx.opp.tricode]: emptySide(ctx.opp.tricode) };
  const players = new Map<string, { tricode: string; line: StretchPlayer }>();
  const nameOf = (id: string, fallback?: string) => ctx.names?.get(id) ?? fallback ?? id;
  const player = (tricode: string, id: number | undefined, fallback?: string): StretchPlayer | null => {
    if (!id) return null;
    const key = String(id);
    let p = players.get(key);
    if (!p) {
      p = { tricode, line: emptyPlayer(key, nameOf(key, fallback)) };
      players.set(key, p);
    }
    return p.line;
  };
  const other = (t: string) => (t === ctx.focus.tricode ? ctx.opp.tricode : ctx.focus.tricode);

  for (const a of actions) {
    const t = elapsedOf(a, regulation);
    if (t <= from || t > to || !a.teamTricode) continue;
    const side = sides[a.teamTricode];
    if (!side) continue;
    const made = a.shotResult === "Made";
    const p = player(a.teamTricode, a.personId, a.playerNameI);
    if (isFga(a)) {
      side.fga++;
      if (p) p.fga++;
      if (made) { side.fgm++; if (p) p.fgm++; }
      if (a.actionType === "3pt") {
        side.fg3a++;
        if (p) p.fg3a++;
        if (made) { side.fg3m++; if (p) p.fg3m++; }
      }
      if (made && a.assistPersonId) {
        side.ast++;
        const ap = player(a.teamTricode, a.assistPersonId, a.assistPlayerNameInitial);
        if (ap) ap.ast++;
      }
      if (!made && a.blockPersonId) {
        sides[other(a.teamTricode)].blk++;
        const bp = player(other(a.teamTricode), a.blockPersonId, a.blockPlayerName);
        if (bp) bp.blk++;
      }
    } else if (a.actionType === "freethrow") {
      side.fta++;
      if (p) p.fta++;
      if (made) { side.ftm++; if (p) p.ftm++; }
    } else if (a.actionType === "rebound" && a.personId) {
      if (a.subType === "offensive") side.oreb++;
      else if (a.subType === "defensive") side.dreb++;
      if (p) p.reb++;
    } else if (a.actionType === "turnover") {
      side.tov++;
      if (p) p.tov++;
      if (a.stealPersonId) {
        sides[other(a.teamTricode)].stl++;
        const sp = player(other(a.teamTricode), a.stealPersonId, a.stealPlayerName);
        if (sp) sp.stl++;
      }
    } else if (a.actionType === "foul" && a.subType !== "technical") {
      side.pf++;
    }
    if (p) p.pts += pointsOf(a);
  }

  // points from the scoreboard, so an overturned basket that stays "Made" in the feed doesn't count
  const start = scoreAt(events, from);
  const end = scoreAt(events, to);
  const homeT = ctx.focus.isHome ? ctx.focus.tricode : ctx.opp.tricode;
  const awayT = ctx.focus.isHome ? ctx.opp.tricode : ctx.focus.tricode;
  sides[homeT].pts = end.home - start.home;
  sides[awayT].pts = end.away - start.away;

  const f = sides[ctx.focus.tricode];
  const o = sides[ctx.opp.tricode];
  finishRates(f, o);
  finishRates(o, f);
  const mean = f.poss != null && o.poss != null ? (f.poss + o.poss) / 2 : null;
  f.offRtg = mean != null && mean > 0 ? (100 * f.pts) / mean : null;
  o.offRtg = mean != null && mean > 0 ? (100 * o.pts) / mean : null;

  const top = (tricode: string) =>
    [...players.values()]
      .filter((x) => x.tricode === tricode)
      .map((x) => x.line)
      .filter((l) => l.pts || l.reb || l.ast || l.stl || l.blk || l.fga || l.fta)
      .sort((a, b) => b.pts - a.pts || (b.reb + b.ast) - (a.reb + a.ast) || a.name.localeCompare(b.name))
      .slice(0, TOP_PLAYERS);
  return { focus: f, opp: o, focusPlayers: top(ctx.focus.tricode), oppPlayers: top(ctx.opp.tricode) };
}

function finishRates(s: StretchSide, opp: StretchSide) {
  const poss = possessions(s);
  s.poss = poss != null && poss > 0 ? poss : null;
  s.efgPct = div(s.fgm + 0.5 * s.fg3m, s.fga);
  s.tovPct = div(s.tov, s.fga + 0.44 * s.fta + s.tov);
  s.orebPct = div(s.oreb, s.oreb + opp.dreb);
  s.ftRate = div(s.fta, s.fga);
  s.threePct = div(s.fg3m, s.fg3a);
}

// ── Runs and fouls ───────────────────────────────────────────────────────────

/** Unanswered runs of `minRun`+ points among scores up to `to` that ended after `from`. */
export function runsEndingIn(events: Scored[], from: number, to: number, tricodes: { home: string; away: string }, minRun = MIN_REPORT_RUN): CheckpointRun[] {
  const out: CheckpointRun[] = [];
  let run: Scored[] = [];
  const flush = () => {
    if (!run.length) return;
    const points = run.reduce((s, e) => s + e.points, 0);
    const last = run[run.length - 1];
    if (points >= minRun && last.elapsed > from) {
      out.push({ tricode: tricodes[run[0].side], points, since: run[0].label, until: last.label });
    }
  };
  for (const e of events.filter((x) => isScore(x) && x.elapsed <= to)) {
    if (run.length && e.side === run[0].side) { run.push(e); continue; }
    flush();
    run = [e];
  }
  flush();
  return out;
}

/** Players in foul trouble at the mark (personal fouls from the play-by-play; technicals excluded). */
export function foulTroubleAt(actions: RawLiveAction[], mark: CheckpointMark, ctx: Pick<ReportContext, "regulation" | "names">): FoulTroubleEntry[] {
  const regulation = ctx.regulation ?? 4;
  const fouls = new Map<string, { tricode: string; name: string; n: number }>();
  for (const a of actions) {
    if (a.actionType !== "foul" || a.subType === "technical" || !a.personId || !a.teamTricode) continue;
    if (elapsedOf(a, regulation) > mark.elapsed) continue;
    const id = String(a.personId);
    const f = fouls.get(id) ?? { tricode: a.teamTricode, name: ctx.names?.get(id) ?? a.playerNameI ?? id, n: 0 };
    f.n++;
    fouls.set(id, f);
  }
  const out: FoulTroubleEntry[] = [];
  for (const [personId, f] of fouls) {
    const status = foulStatus(f.n, mark.period);
    if (status) out.push({ personId, name: f.name, tricode: f.tricode, fouls: f.n, status });
  }
  return out.sort((a, b) => b.fouls - a.fouls || a.name.localeCompare(b.name));
}

// ── Keys vs season ───────────────────────────────────────────────────────────

const KEY_DEFS: { metric: KeyMetric; side: "offense" | "defense"; label: string; short: string; lowerBetter: boolean }[] = [
  { metric: "efgPct", side: "offense", label: "Our shooting (eFG%)", short: "our eFG%", lowerBetter: false },
  { metric: "tovPct", side: "offense", label: "Our turnovers (TOV%)", short: "our TOV%", lowerBetter: true },
  { metric: "orebPct", side: "offense", label: "Our offensive glass (OREB%)", short: "our OREB%", lowerBetter: false },
  { metric: "ftRate", side: "offense", label: "Our trips to the line (FTA rate)", short: "our FTA rate", lowerBetter: false },
  { metric: "efgPct", side: "defense", label: "Their shooting (eFG% allowed)", short: "the eFG% we allow", lowerBetter: true },
  { metric: "tovPct", side: "defense", label: "Turnovers we force (opp. TOV%)", short: "the TOV% we force", lowerBetter: false },
  { metric: "orebPct", side: "defense", label: "Their offensive glass (opp. OREB%)", short: "their OREB%", lowerBetter: true },
  { metric: "ftRate", side: "defense", label: "Their trips to the line (opp. FTA rate)", short: "their FTA rate", lowerBetter: true },
];

/** A "Watch:" headline needs the game so far to be at least this far on the wrong side of the season. */
export const WATCH_GAP: Record<KeyMetric, number> = { efgPct: 0.05, tovPct: 0.03, orebPct: 0.05, ftRate: 0.08 };

const OPP_KEY: Record<KeyMetric, keyof SeasonFactors> = {
  efgPct: "oppEfgPct", tovPct: "oppTovPct", orebPct: "oppOrebPct", ftRate: "oppFtRate",
};

/** Same precision the UI shows (0.1 percentage point / 0.001 FTA rate) counts as even. */
function verdict(tonight: number | null, season: number | null, lowerBetter: boolean): KeyCheck["verdict"] {
  if (tonight == null || season == null) return null;
  if (Math.abs(tonight - season) < 0.0005) return "even";
  return (lowerBetter ? tonight < season : tonight > season) ? "better" : "worse";
}

export function keyChecks(game: { focus: StretchSide; opp: StretchSide }, season: ReportContext["season"]): KeyCheck[] {
  return KEY_DEFS.map((d) => {
    const tonight = d.side === "offense" ? game.focus[d.metric] : game.opp[d.metric];
    const ours = season?.focus ? (d.side === "offense" ? season.focus[d.metric] : season.focus[OPP_KEY[d.metric]]) : null;
    const theirs = season?.opp ? season.opp[d.metric] : null;
    return { metric: d.metric, side: d.side, label: d.label, short: d.short, tonight, season: ours, opponentSeason: theirs, verdict: verdict(tonight, ours, d.lowerBetter) };
  });
}

// ── Headlines ────────────────────────────────────────────────────────────────

/** Gaps at least this big in one segment are worth a bullet. */
export const HEADLINE_GAPS = { tov: 3, oreb: 3, fta: 4, fg3m: 3 } as const;

const surname = (name: string) => name.replace(/^[A-Z]\.\s+/, "").split(" ").slice(-1)[0] || name;

export function headlines(r: Omit<CheckpointReport, "headlines">, focus: string, opp: string): string[] {
  const out: string[] = [];
  const { score, margin, segment } = r;
  const state = margin > 0 ? `${focus} lead ${score.focus}-${score.opp}` : margin < 0 ? `${focus} trail ${score.focus}-${score.opp}` : `Tied ${score.focus}-${score.opp}`;
  const segNet = segment.focus.pts - segment.opp.pts;
  const since = segment.from === "Tip-off" ? "since tip-off" : `since ${segment.from.replace(/^End of/, "the end of")}`;
  const segPart = segNet === 0
    ? `the stretch ${since} was even at ${segment.focus.pts}-${segment.opp.pts}`
    : `${segNet > 0 ? focus : opp} won the stretch ${since} ${Math.max(segment.focus.pts, segment.opp.pts)}-${Math.min(segment.focus.pts, segment.opp.pts)}`;
  out.push(`${state}; ${segPart}.`);

  const biggest = [...segment.runs].sort((a, b) => b.points - a.points)[0];
  if (biggest) out.push(`${biggest.tricode} went on ${/^(8|11|18)$/.test(String(biggest.points)) ? "an" : "a"} ${biggest.points}-0 run (${biggest.since} to ${biggest.until}).`);

  const f = segment.focus;
  const o = segment.opp;
  const gap = (label: string, a: number, b: number, min: number, lowerBetter = false) => {
    if (Math.abs(a - b) < min) return;
    const leader = (lowerBetter ? a < b : a > b) ? focus : opp;
    out.push(`${label}: ${focus} ${a}, ${opp} ${b} in the stretch — edge ${leader}.`);
  };
  gap("Turnovers", f.tov, o.tov, HEADLINE_GAPS.tov, true);
  gap("Offensive rebounds", f.oreb, o.oreb, HEADLINE_GAPS.oreb);
  gap("Free-throw attempts", f.fta, o.fta, HEADLINE_GAPS.fta);
  gap("Threes made", f.fg3m, o.fg3m, HEADLINE_GAPS.fg3m);

  const lead = (players: StretchPlayer[], tricode: string) => {
    const p = players[0];
    if (!p || p.pts < 5) return;
    out.push(`${surname(p.name)} (${tricode}) had ${p.pts} in the stretch on ${p.fgm}/${p.fga} FG${p.fg3a ? `, ${p.fg3m}/${p.fg3a} 3PT` : ""}.`);
  };
  lead(segment.focusPlayers, focus);
  lead(segment.oppPlayers, opp);

  // the factor furthest on the wrong side of the season (relative to its watch gap), if any clears it
  const watch = r.keys
    .filter((k) => k.verdict === "worse" && k.tonight != null && k.season != null && Math.abs(k.tonight - k.season) >= WATCH_GAP[k.metric])
    .sort((a, b) => Math.abs(b.tonight! - b.season!) / WATCH_GAP[b.metric] - Math.abs(a.tonight! - a.season!) / WATCH_GAP[a.metric])[0];
  if (watch) {
    const fmt = (v: number | null) => (watch.metric === "ftRate" ? fmtNum(v, 3) : fmtPct(v));
    out.push(`Watch: ${watch.short} is ${fmt(watch.tonight)} so far vs ${fmt(watch.season)} on the season.`);
  }

  const ours = r.foulTrouble.filter((x) => x.tricode === focus);
  const theirs = r.foulTrouble.filter((x) => x.tricode === opp);
  const fouls = (xs: FoulTroubleEntry[]) => xs.map((x) => `${surname(x.name)} (${x.fouls})`).join(", ");
  if (ours.length) out.push(`Foul trouble, ${focus}: ${fouls(ours)}.`);
  if (theirs.length) out.push(`Foul trouble, ${opp}: ${fouls(theirs)}.`);
  return out;
}

// ── Assembly ─────────────────────────────────────────────────────────────────

/** Every checkpoint report the game has reached, oldest first. */
export function buildCheckpointReports(actions: RawLiveAction[], currentPeriod: number, ctx: ReportContext): { reports: CheckpointReport[]; next: CheckpointMark | null } {
  const regulation = ctx.regulation ?? 4;
  const acts = ordered(actions);
  const events = scoringEvents(acts, regulation);
  const { reached, next } = reachedMarks(ctx.elapsedNow, currentPeriod, regulation);
  const tricodes = ctx.focus.isHome ? { home: ctx.focus.tricode, away: ctx.opp.tricode } : { home: ctx.opp.tricode, away: ctx.focus.tricode };

  const reports = reached.map((mark, i) => {
    const prev = reached[i - 1];
    const from = prev ? prev.elapsed : -1;
    const seg = stretchBox(acts, events, from, mark.elapsed, ctx);
    const game = stretchBox(acts, events, -1, mark.elapsed, ctx);
    const s = scoreAt(events, mark.elapsed);
    const score = ctx.focus.isHome ? { focus: s.home, opp: s.away } : { focus: s.away, opp: s.home };
    const base: Omit<CheckpointReport, "headlines"> = {
      id: mark.id,
      label: mark.label,
      period: mark.period,
      clock: formatClock(mark.clockSec) ?? "0:00",
      elapsed: mark.elapsed,
      score,
      margin: score.focus - score.opp,
      segment: { from: prev?.label ?? "Tip-off", ...seg, runs: runsEndingIn(events, from, mark.elapsed, tricodes) },
      game,
      foulTrouble: foulTroubleAt(acts, mark, ctx),
      keys: keyChecks(game, ctx.season),
    };
    return { ...base, headlines: headlines(base, ctx.focus.tricode, ctx.opp.tricode) };
  });
  return { reports, next };
}
