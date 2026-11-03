/**
 * Spoken play-by-play: turns NBA live-feed actions into short broadcast-style sentences for a
 * text-to-speech voice. Pure — every word comes from the feed's structured fields (shooter, shot
 * style, distance, assist, steal, block, score); the feed's shorthand `description` is never read
 * aloud. See the basketball-metrics skill, "Spoken play-by-play".
 */
import { foulStatus, formatClock, parseClock, type RawLiveAction, type RawLiveBoxScore, type RawLiveTeam } from "./live";

/** focus = every score and period break, plus the focus team's highlights */
export type CallLevel = "focus" | "highlights" | "everything";

/** 1 = always read (scores, period breaks) · 2 = highlights (stops, turnovers, timeouts) · 3 = the rest */
export type CallPriority = 1 | 2 | 3;

/**
 * How big the play is, for the voice's delivery: 0 = routine · 1 = big (dunks, blocks, steals,
 * lead changes) · 2 = huge (lobs, putback slams, deep threes, and-ones, buzzer-beaters, clutch
 * go-ahead baskets, double-digit runs, 30-point nights). Only the focus team's plays reach 2 —
 * the announcer is a Lakers voice — and those open with an exclamation.
 */
export type Hype = 0 | 1 | 2;

export interface PlayCall {
  /** actionNumber of the play that completes the call (a free-throw trip's last shot) */
  id: number;
  order: number;
  period: number;
  clock: string;
  /** teams the call is about: the actor's, plus the stealer's / blocker's */
  tricodes: string[];
  priority: CallPriority;
  hype: Hype;
  text: string;
}

export interface CallContext {
  focusTricode: string;
  home: { tricode: string; name: string };
  away: { tricode: string; name: string };
  /** personId → spoken name: family name, or the full name when two players in the game share one */
  names: Map<number, string>;
  regulation: number;
}

export function callContext(box: RawLiveBoxScore, focusTeamId: string): CallContext {
  const players = [...box.homeTeam.players, ...box.awayTeam.players];
  const family = (p: (typeof players)[number]) => p.familyName || p.name.split(" ").slice(1).join(" ") || p.name;
  const count = new Map<string, number>();
  for (const p of players) count.set(family(p), (count.get(family(p)) ?? 0) + 1);
  const side = (t: RawLiveTeam) => ({ tricode: t.teamTricode, name: t.teamName });
  const focus = String(box.homeTeam.teamId) === focusTeamId ? box.homeTeam : box.awayTeam;
  return {
    focusTricode: focus.teamTricode,
    home: side(box.homeTeam),
    away: side(box.awayTeam),
    names: new Map(players.map((p) => [p.personId, (count.get(family(p)) ?? 0) > 1 ? p.name : family(p)])),
    regulation: box.regulationPeriods || 4,
  };
}

export function keepCall(c: PlayCall, level: CallLevel, focusTricode: string): boolean {
  if (level === "everything" || c.priority === 1) return true;
  if (c.priority === 3) return false;
  return level === "highlights" || c.tricodes.includes(focusTricode);
}

/** Calls after `afterOrder` (an `orderNumber`) worth saying at `level`, in game order. */
export function newCalls(calls: PlayCall[], afterOrder: number, level: CallLevel, focusTricode: string): PlayCall[] {
  return calls.filter((c) => c.order > afterOrder && keepCall(c, level, focusTricode));
}

/**
 * When the voice falls behind: drop waiting minor calls (except the newest), then the oldest
 * baskets, so what's said stays close to live.
 */
export function trimQueue(queue: PlayCall[], max = 4): PlayCall[] {
  if (queue.length <= max) return queue;
  return queue.filter((c, i) => c.priority === 1 || c.hype === 2 || i === queue.length - 1).slice(-max);
}

// ── Score state ──────────────────────────────────────────────────────────────

type Side = "home" | "away";

interface ScoreState {
  home: number;
  away: number;
  /** unanswered points by the side that scored last */
  runSide: Side | null;
  runPoints: number;
}

/** Announce a run when it first reaches each of these. */
const RUN_MARKS = [8, 10, 12, 15, 20];
/** Announce a player's points when they first reach each of these. */
const POINT_MARKS = [20, 30, 40, 50];

function applyScore(s: ScoreState, a: RawLiveAction) {
  if (a.scoreHome == null || a.scoreAway == null) return;
  const h = Number(a.scoreHome);
  const w = Number(a.scoreAway);
  if (Number.isNaN(h) || Number.isNaN(w)) return;
  const deltas: [Side, number][] = [["home", h - s.home], ["away", w - s.away]];
  if (deltas.some(([, d]) => d < 0)) {
    // a basket taken back: the run no longer stands
    s.runSide = null;
    s.runPoints = 0;
  } else {
    for (const [side, d] of deltas) {
      if (d <= 0) continue;
      s.runPoints = s.runSide === side ? s.runPoints + d : d;
      s.runSide = side;
    }
  }
  s.home = h;
  s.away = w;
}

const teamOf = (ctx: CallContext, side: Side) => ctx[side].name;

function teamName(ctx: CallContext, tricode: string | undefined): string {
  if (tricode === ctx.home.tricode) return ctx.home.name;
  if (tricode === ctx.away.tricode) return ctx.away.name;
  return tricode ?? "";
}

function otherTricode(ctx: CallContext, tricode: string | undefined): string {
  return tricode === ctx.home.tricode ? ctx.away.tricode : ctx.home.tricode;
}

function leader(ctx: CallContext, s: ScoreState): [team: string, hi: number, lo: number] {
  return s.home > s.away ? [ctx.home.name, s.home, s.away] : [ctx.away.name, s.away, s.home];
}

function fullScore(ctx: CallContext, s: ScoreState): string {
  if (s.home === s.away) return s.home === 0 ? "Still no score." : `All tied at ${s.home}.`;
  const [team, hi, lo] = leader(ctx, s);
  return `${team} lead ${hi} to ${lo}.`;
}

/** The run mark this score first reached, if any. */
function runMarkHit(before: ScoreState, after: ScoreState): number | null {
  if (!after.runSide || after.runPoints < RUN_MARKS[0]) return null;
  const prev = before.runSide === after.runSide ? before.runPoints : 0;
  return RUN_MARKS.filter((m) => prev < m && after.runPoints >= m).at(-1) ?? null;
}

/** The points mark a player first reached with this score, if any. */
function pointMarkHit(pointsTotal: number | undefined, scored: number): number | null {
  if (pointsTotal == null) return null;
  const prev = pointsTotal - scored;
  return POINT_MARKS.filter((m) => prev < m && pointsTotal >= m).at(-1) ?? null;
}

const leadOf = (s: ScoreState) => Math.sign(s.home - s.away);

/** The lead changed hands or was tied up (the game's first basket doesn't count). */
const leadFlipped = (before: ScoreState, after: ScoreState) =>
  before.home + before.away > 0 && leadOf(before) !== leadOf(after);

/** What a basket did to the scoreboard, plus a run or player milestone it reached. */
function scoreNote(ctx: CallContext, before: ScoreState, after: ScoreState, clutch: boolean): string {
  const lead = leadOf;
  let note: string;
  if (after.home === after.away) {
    note = `All tied at ${after.home}.`;
  } else {
    const [team, hi, lo] = leader(ctx, after);
    if (before.home + before.away === 0) note = `${team} on the board first.`;
    else if (lead(before) === 0) note = `${team} back in front, ${hi} to ${lo}.`;
    else if (lead(before) !== lead(after)) note = `${team} take the lead, ${hi} to ${lo}.`;
    else note = clutch ? `${team} lead ${hi} to ${lo}.` : `${team} up ${hi - lo}.`;
  }
  if (after.runSide && runMarkHit(before, after) != null) {
    note += ` That's ${after.runPoints} straight points for the ${teamOf(ctx, after.runSide)}.`;
  }
  return note;
}

function pointsNote(name: string, pointsTotal: number | undefined, scored: number): string {
  return pointMarkHit(pointsTotal, scored) != null ? `That's ${pointsTotal} for ${name}.` : "";
}

/** How big a made field goal is, before the focus-team cap. */
function shotHype(a: RawLiveAction, before: ScoreState, after: ScoreState, clutch: boolean, clockSec: number | null, points: number): Hype {
  const d = a.descriptor ?? "";
  const flip = leadFlipped(before, after);
  const run = runMarkHit(before, after) ?? 0;
  const mark = pointMarkHit(a.pointsTotal, points) ?? 0;
  const dunk = a.subType === "DUNK";
  if (clockSec != null && clockSec <= 0) return 2;
  if (clutch && flip) return 2;
  if (dunk && (d.includes("alley-oop") || d.includes("putback"))) return 2;
  if (a.actionType === "3pt" && ((a.shotDistance ?? 0) >= 28 || a.qualifiers?.includes("heave"))) return 2;
  if (run >= 10 || mark >= 30) return 2;
  if (dunk || flip || run > 0 || mark > 0) return 1;
  return 0;
}

const SHOUTS = ["Oh my!", "Are you kidding me?!", "Wow!", "What a play!", "Unbelievable!", "Oh, yes!"];

// ── Phrasing ─────────────────────────────────────────────────────────────────

/** Deterministic variety: the same play always gets the same wording. */
function pick(options: string[], seed: number): string {
  return options[seed % options.length];
}

function who(ctx: CallContext, id: number | undefined, fallback?: string): string | null {
  if (id && ctx.names.has(id)) return ctx.names.get(id)!;
  // feed fallbacks are "Peterson" or "A. Bailey"
  return fallback?.replace(/^[A-Z]\.\s+/, "") || null;
}

const QUARTERS = ["first", "second", "third", "fourth"];
const OVERTIMES = ["", "", "second", "third", "fourth", "fifth", "sixth"];

function periodName(period: number, regulation: number): string {
  if (period <= regulation) return `${QUARTERS[period - 1] ?? `period ${period}`} quarter`;
  const ot = period - regulation;
  return ot === 1 ? "overtime" : `${OVERTIMES[ot] ?? `${ot}th`} overtime`;
}

function clockPrefix(sec: number): string {
  if (sec <= 0) return "At the buzzer!";
  if (sec >= 60) return `${formatClock(sec)} left.`;
  const whole = Math.ceil(sec);
  return whole === 1 ? "1 second left." : `${whole} seconds left.`;
}

function madeShot(ctx: CallContext, a: RawLiveAction, s: string): string {
  const d = a.descriptor ?? "";
  const has = (w: string) => d.includes(w);
  const seed = a.actionNumber;
  const assist = a.assistPersonId ? who(ctx, a.assistPersonId, a.assistPlayerNameInitial) : null;
  let line: string;
  let assistSaid = false;

  if (a.actionType === "3pt") {
    const style = has("step back") ? "step-back three" : has("pullup") ? "pull-up three" : has("fadeaway") ? "fadeaway three" : null;
    const dist = Math.round(a.shotDistance ?? 0);
    if (a.qualifiers?.includes("heave")) line = `${s} from way downtown... it counts!`;
    else if (dist >= 28) line = `${s}, ${style ?? "three"} from ${dist} feet... ${pick(["got it!", "bang!", "splash!"], seed)}`;
    else if (style) line = pick([`${s} with the ${style}... got it!`, `${s} hits the ${style}.`], seed);
    else if (has("running")) line = `${s} for three on the move... good!`;
    else line = pick([`${s} for three... got it!`, `${s} knocks down the three.`, `${s} buries the three!`], seed);
  } else if (a.subType === "DUNK") {
    if (has("alley-oop") && assist) { line = `${assist} lobs it up... ${s} throws it down!`; assistSaid = true; }
    else if (has("alley-oop")) line = `${s} with the alley-oop slam!`;
    else if (has("putback") || has("tip")) line = `${s} with the putback slam!`;
    else if (has("reverse")) line = `${s} with the reverse slam!`;
    else if (has("cutting")) line = `${s} cuts and slams it home!`;
    else if (has("driving")) line = `${s} drives and throws it down!`;
    else line = pick([`${s} throws it down!`, `${s} slams it home!`, `${s} with the big dunk!`], seed);
  } else if (a.subType === "Layup") {
    if (has("alley-oop") && assist) { line = `${assist} lobs it to ${s}, who lays it in.`; assistSaid = true; }
    else if (has("alley-oop")) line = `${s} with the alley-oop layup.`;
    else if (has("tip")) line = `${s} tips it in.`;
    else if (has("putback")) line = `${s} puts it back in.`;
    else if (has("finger roll")) line = `${s} with the finger roll.`;
    else if (has("reverse")) line = `${s} with the reverse layup.`;
    else if (has("driving")) line = pick([`${s} drives and scores.`, `${s} attacks the rim and lays it in.`], seed);
    else if (has("cutting")) line = `${s} cuts to the rim and scores.`;
    else if (has("running")) line = `${s} on the run, lays it in.`;
    else line = `${s} lays it in.`;
  } else if (a.subType === "Hook") {
    const glass = has("bank") ? " off the glass" : "";
    if (has("turnaround")) line = `${s} with the turnaround hook${glass}, good.`;
    else if (has("driving")) line = `${s} drives, hook shot${glass}, good.`;
    else line = `${s} with the hook${glass}, good.`;
  } else {
    const noun = has("floating") ? "floater"
      : has("pullup") ? "pull-up"
      : has("turnaround fadeaway") ? "turnaround fadeaway"
      : has("fadeaway") ? "fadeaway"
      : has("turnaround") ? "turnaround jumper"
      : has("step back") ? "step-back jumper"
      : "jumper";
    const dist = Math.round(a.shotDistance ?? 0);
    const from = dist >= 10 && noun !== "floater" ? ` from ${dist}` : "";
    const glass = has("bank") ? " off the glass" : "";
    const lead = has("driving") ? `${s} drives,` : has("running") ? `${s} on the move,` : `${s},`;
    line = `${lead} ${noun}${from}${glass}... ${pick(["good.", "got it.", "it's good."], seed)}`;
  }

  if (a.qualifiers?.includes("fastbreak")) line = `On the break, ${line}`;
  if (assist && !assistSaid) line += ` ${pick([`${assist} with the assist.`, `Assist, ${assist}.`, `Nice feed from ${assist}.`], seed + 1)}`;
  return line;
}

function missedShot(a: RawLiveAction, s: string): string {
  if (a.actionType === "3pt") return `${s} misses from three.`;
  if (a.subType === "DUNK") return `${s} misses the dunk!`;
  if (a.subType === "Layup") return `${s} misses the layup.`;
  if (a.subType === "Hook") return `${s} misses the hook.`;
  return `${s} misses the jumper.`;
}

function turnover(a: RawLiveAction, s: string, stealer: string | null): string {
  const sub = a.subType ?? "";
  const d = a.descriptor ?? "";
  if (stealer) {
    if (sub === "bad pass" || d === "bad pass") return pick([`${stealer} picks off the pass from ${s}!`, `${stealer} jumps the passing lane, steal!`], a.actionNumber);
    if (sub === "lost ball" || d === "lost ball") return pick([`${stealer} strips ${s}!`, `${stealer} pokes it away from ${s}!`], a.actionNumber);
    return `${stealer} with the steal from ${s}.`;
  }
  switch (sub) {
    case "bad pass": return `Bad pass by ${s}, turnover.`;
    case "lost ball": return `${s} loses the handle, turnover.`;
    case "out-of-bounds":
      if (d === "bad pass") return `The pass from ${s} sails out of bounds.`;
      if (d === "lost ball") return `${s} loses it out of bounds.`;
      if (d === "step") return `${s} steps out of bounds.`;
      return `${s} turns it over out of bounds.`;
    case "traveling": return `${s} is called for traveling.`;
    case "shot clock": return `Shot-clock violation on ${s}.`;
    case "backcourt": return `Backcourt violation on ${s}.`;
    case "double dribble": return `Double dribble on ${s}.`;
    case "offensive goaltending": return `Offensive goaltending on ${s}.`;
    default: return `Turnover on ${s}.`;
  }
}

function freeThrowTrip(made: number, attempts: number, s: string, kind: "technical" | "and-one3" | "and-one4" | "plain"): string {
  if (attempts === 1) {
    if (kind === "technical") return made ? `${s} makes the technical free throw.` : `${s} misses the technical free throw.`;
    if (kind === "and-one3" || kind === "and-one4") {
      return made ? `${s} completes the ${kind === "and-one4" ? "four" : "three"}-point play!` : `${s} misses the free throw on the and-one.`;
    }
    return made ? `${s} makes the free throw.` : `${s} misses the free throw.`;
  }
  if (made === attempts) return attempts === 2 ? `${s} hits both free throws.` : `${s} hits all ${attempts} free throws.`;
  if (made === 0) return attempts === 2 ? `${s} misses both free throws.` : `${s} misses all ${attempts} free throws.`;
  return attempts === 2 ? `${s} splits the pair at the line.` : `${s} makes ${made} of ${attempts} at the line.`;
}

// ── Builder ──────────────────────────────────────────────────────────────────

interface Trip {
  made: number;
  attempts: number;
  before: ScoreState;
  pointsTotal?: number;
}

/** Every play worth saying, in game order, filtered to `level`. */
export function playCalls(actions: RawLiveAction[], ctx: CallContext, level: CallLevel = "highlights"): PlayCall[] {
  const out: PlayCall[] = [];
  const state: ScoreState = { home: 0, away: 0, runSide: null, runPoints: 0 };
  const trips = new Map<number, Trip>();
  const subsOut = new Map<string, string[]>();
  const subsIn = new Map<string, string[]>();
  let lastMade: { personId: number; period: number; clock: string; points: number } | null = null;

  for (const a of [...actions].sort((x, y) => x.orderNumber - y.orderNumber)) {
    const before = { ...state };
    applyScore(state, a);
    const clockSec = parseClock(a.clock);
    const clutch = a.period >= ctx.regulation && clockSec != null && clockSec <= 120;
    const team = teamName(ctx, a.teamTricode);
    const s = who(ctx, a.personId, a.playerName) ?? `the ${team}`;
    const actor = a.teamTricode ? [a.teamTricode] : [ctx.home.tricode, ctx.away.tricode];

    /** big plays by the other team stay at 1: louder for the Lakers than against them */
    const hypeFor = (h: Hype, tricode = a.teamTricode): Hype => (tricode === ctx.focusTricode ? h : (Math.min(h, 1) as Hype));
    const emit = (priority: CallPriority, parts: string[], tricodes = actor, timed = true, hype: Hype = 0, shout = pick(SHOUTS, a.actionNumber)) => {
      const text = [hype === 2 ? shout : "", timed && clutch && priority < 3 && clockSec != null ? clockPrefix(clockSec) : "", ...parts]
        .filter(Boolean)
        .join(" ")
        // a name ending in "Jr." closing a sentence; leaves "..." alone
        .replace(/(?<!\.)\.\.(?!\.)/g, ".");
      const call: PlayCall = { id: a.actionNumber, order: a.orderNumber, period: a.period, clock: formatClock(clockSec) ?? "", tricodes, priority, hype, text };
      if (keepCall(call, level, ctx.focusTricode)) out.push(call);
    };

    switch (a.actionType) {
      case "2pt":
      case "3pt": {
        if (a.shotResult === "Made") {
          const points = a.actionType === "3pt" ? 3 : 2;
          lastMade = { personId: a.personId ?? 0, period: a.period, clock: a.clock, points };
          const hype = hypeFor(shotHype(a, before, state, clutch, clockSec, points));
          emit(1, [madeShot(ctx, a, s), scoreNote(ctx, before, state, clutch), pointsNote(s, a.pointsTotal, points)], actor, true, hype);
        } else if (a.blockPersonId) {
          const b = who(ctx, a.blockPersonId, a.blockPlayerName) ?? "the defense";
          const line = pick([`${b} blocks ${s}!`, `${b} with the block on ${s}!`, `${s} goes up... rejected by ${b}!`], a.actionNumber);
          emit(2, [line], [...actor, otherTricode(ctx, a.teamTricode)], true, hypeFor(1, otherTricode(ctx, a.teamTricode)));
        } else {
          emit(3, [missedShot(a, s)]);
        }
        break;
      }
      case "freethrow": {
        const m = /(\d) of (\d)/.exec(a.subType ?? "");
        if (!m || a.personId == null) break;
        const trip = trips.get(a.personId) ?? { made: 0, attempts: 0, before };
        trip.attempts += 1;
        if (a.shotResult === "Made") {
          trip.made += 1;
          trip.pointsTotal = a.pointsTotal ?? trip.pointsTotal;
        }
        trips.set(a.personId, trip);
        if (m[1] !== m[2]) break;
        trips.delete(a.personId);
        const andOne = lastMade && lastMade.personId === a.personId && lastMade.period === a.period && lastMade.clock === a.clock;
        const kind = a.descriptor === "technical" ? "technical" : trip.attempts === 1 && andOne ? (lastMade!.points === 3 ? "and-one4" : "and-one3") : "plain";
        const line = freeThrowTrip(trip.made, trip.attempts, s, kind);
        const andOneMade = (kind === "and-one3" || kind === "and-one4") && trip.made > 0;
        // same milestone rules as made shots; a clutch go-ahead trip is big, not huge
        const mark = pointMarkHit(trip.pointsTotal, trip.made) ?? 0;
        const hype = hypeFor(andOneMade || mark >= 30 ? 2 : mark > 0 || (clutch && leadFlipped(trip.before, state)) ? 1 : 0);
        if (trip.made > 0) emit(1, [line, scoreNote(ctx, trip.before, state, clutch), pointsNote(s, trip.pointsTotal, trip.made)], actor, true, hype);
        else emit(2, [line]);
        break;
      }
      case "turnover": {
        if (a.subType === "offensive foul") break; // called from the foul, which knows if it was a charge
        const stealer = a.stealPersonId ? who(ctx, a.stealPersonId, a.stealPlayerName) : null;
        emit(2, [turnover(a, s, stealer)], stealer ? [...actor, otherTricode(ctx, a.teamTricode)] : actor, true, stealer ? hypeFor(1, otherTricode(ctx, a.teamTricode)) : 0);
        break;
      }
      case "foul": {
        const d = a.descriptor ?? "";
        let priority: CallPriority = 3;
        let line: string;
        if (a.subType === "offensive") {
          priority = 2;
          line = d === "charge" ? `${s} is called for the charge.` : `Offensive foul on ${s}.`;
        } else if (a.subType === "technical") {
          if (d === "defensive-3-second") line = `Defensive three seconds on ${s}.`;
          else { priority = 2; line = d === "flopping" ? `${s} is called for a flop, technical.` : `Technical foul on ${s}.`; }
        } else if (d.startsWith("flagrant")) {
          priority = 2;
          line = `Flagrant ${d.endsWith("2") ? "two" : "one"} on ${s}.`;
        } else if (d === "shooting") {
          const drawn = who(ctx, a.foulDrawnPersonId, a.foulDrawnPlayerName);
          line = drawn ? `${s} fouls ${drawn} on the shot.` : `Shooting foul on ${s}.`;
        } else if (d === "take") line = `${s} takes the foul.`;
        else if (d === "loose ball") line = `Loose-ball foul on ${s}.`;
        else line = `Foul on ${s}.`;

        const pf = a.foulPersonalTotal;
        let trouble = "";
        if (a.subType !== "technical" && pf) {
          if (pf >= 6) trouble = `That's six fouls. ${s} has fouled out.`;
          else if (foulStatus(pf, a.period) === "trouble" && foulStatus(pf - 1, a.period) !== "trouble") trouble = `That's foul number ${pf} on ${s}.`;
          if (trouble) priority = Math.min(priority, 2) as CallPriority;
        }
        emit(priority, [line, trouble]);
        break;
      }
      case "rebound": {
        if (!a.personId || a.qualifiers?.includes("team")) break;
        emit(3, [a.subType === "offensive" ? `${s} grabs the offensive rebound.` : pick([`Rebound, ${s}.`, `${s} pulls down the rebound.`], a.actionNumber)]);
        break;
      }
      case "substitution": {
        const key = a.teamTricode ?? "";
        const [mine, theirs] = a.subType === "in" ? [subsIn, subsOut] : [subsOut, subsIn];
        const waiting = theirs.get(key) ?? [];
        const partner = waiting.shift();
        if (!partner) { mine.set(key, [...(mine.get(key) ?? []), s]); break; }
        emit(3, [a.subType === "in" ? `${s} checks in for ${partner}.` : `${partner} checks in for ${s}.`]);
        break;
      }
      case "timeout": {
        if (a.subType === "challenge") emit(2, [`The ${team} are challenging the call.`]);
        else if (!a.teamTricode) emit(2, ["Timeout on the floor.", fullScore(ctx, state)]);
        else emit(2, [`Timeout, ${team}.`, fullScore(ctx, state)]);
        break;
      }
      case "jumpball": {
        const won = who(ctx, a.jumpBallWonPersonId, a.jumpBallWonPlayerName);
        if (!won) break;
        if (a.descriptor === "startperiod") emit(2, [`${won} wins the tip.`], actor, false);
        else emit(3, [`Jump ball. ${won} wins it.`]);
        break;
      }
      case "violation": {
        if (a.subType === "defensive goaltending") emit(2, [`Goaltending called on ${s}.`]);
        else if (a.subType) emit(3, [`${a.subType[0].toUpperCase()}${a.subType.slice(1)} violation on ${s}.`]);
        break;
      }
      case "period": {
        const both = [ctx.home.tricode, ctx.away.tricode];
        if (a.subType === "start") {
          const line = a.period === 1 ? `We're underway, ${ctx.away.name} at ${ctx.home.name}.` : `The ${periodName(a.period, ctx.regulation)} is underway.`;
          emit(1, [line], both, false);
        } else if (a.subType === "end") {
          if (a.period === ctx.regulation / 2) emit(1, ["That's halftime.", fullScore(ctx, state)], both, false);
          else if (a.period < ctx.regulation) emit(1, [`That's the end of the ${periodName(a.period, ctx.regulation)}.`, fullScore(ctx, state)], both, false);
          else if (state.home === state.away) {
            const line = a.period === ctx.regulation ? `We're headed to overtime, tied at ${state.home}!` : `Still tied at ${state.home}. We're headed to another overtime!`;
            emit(1, [line], both, false);
          }
          // a decided final period is called by the game-end action that follows
        }
        break;
      }
      case "game": {
        if (a.subType !== "end" || state.home === state.away) break;
        const [winner, hi, lo] = leader(ctx, state);
        const won = winner === teamName(ctx, ctx.focusTricode);
        emit(1, [`That's the final. The ${winner} win it, ${hi} to ${lo}.`], [ctx.home.tricode, ctx.away.tricode], false, won ? 2 : 0, "Ball game!");
        break;
      }
      // steal / block are called from the turnover / missed shot they belong to; heave duplicates its 3pt
    }
  }
  return out;
}
