/**
 * Lineup Lab: how the team does with a chosen set of players on the floor together, optionally
 * with other players off it. Built from NBA.com totals per group (team, each player on court,
 * every 2/3/4/5-man group that played). "With S on and X off" is exact arithmetic on those totals
 * (inclusion–exclusion):
 *
 *   T(S on, X off) = Σ over subsets A of X of (−1)^|A| · T(S ∪ A on)
 *
 * e.g. Dončić + Kessler without Reaves = T(Dončić, Kessler) − T(Dončić, Kessler, Reaves).
 * A group missing from NBA.com's list never shared the floor (zero) — which only holds if the list
 * is complete, so `sizeCoverage` checks each size against the team's minutes and rows that
 * subtract an incomplete size carry a warning. Ratings and four factors are then the season
 * box-score formulas applied to those minutes. Pure — /api/lineups queries.
 * Spec: basketball-metrics skill → "Lineup Lab".
 */
import { div, efg, orebPct, possessions, tovPct } from "./teamProfiles";

/** Largest group NBA.com reports, so on + off together can't exceed it. */
export const MAX_COMBO_PLAYERS = 5;
/** Under this many minutes together a combination is flagged "small sample". */
export const SMALL_SAMPLE_MINUTES = 50;
/**
 * Rounding allowance per term: NBA.com minute totals carry rounding, and a result sums up to 2^|off|
 * of them. Less than this per term left over = never on the floor that way.
 */
const MIN_MINUTES_PER_TERM = 0.05;
/**
 * Every minute has exactly five players on the floor, so a complete list of k-man groups adds up
 * to C(5, k) × the team's minutes. Below this share, that size's list is missing groups.
 */
export const MIN_COVERAGE = 0.99;

export interface OppTotals {
  pts: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  oreb: number;
  dreb: number;
  tov: number;
}

export interface GroupTotals {
  gamesPlayed: number;
  minutes: number;
  pts: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  oreb: number;
  dreb: number;
  ast: number;
  tov: number;
  stl: number;
  blk: number;
  plusMinus: number;
  /** opponents over the same minutes; null when not loaded */
  opp: OppTotals | null;
}

export type ComboKind = "selection" | "any" | "without" | "team";

export interface ComboRow {
  /** stable id: "on:<ids>|off:<ids>" */
  id: string;
  kind: ComboKind;
  /** in the order picked */
  on: string[];
  off: string[];
  /** for "any" / "without" rows: the selected player taken out of the group */
  removed: string | null;
  /** "Dončić + Kessler, no Reaves" */
  label: string;
  /** null when the combination can't be computed (see error) */
  minutes: number | null;
  /** only for a group taken straight from NBA.com (nobody required off); games don't subtract */
  gamesPlayed: number | null;
  pts: number | null;
  oppPts: number | null;
  plusMinus: number | null;
  /** box-score estimate: mean of both sides' possessions when opponent totals are loaded */
  poss: number | null;
  offRtg: number | null;
  defRtg: number | null;
  netRtg: number | null;
  /** possessions per 48 minutes (lineup data has minutes, unlike game box scores: "Pace/48") */
  pace: number | null;
  efgPct: number | null;
  tovPct: number | null;
  orebPct: number | null;
  ftRate: number | null;
  threePaRate: number | null;
  threePct: number | null;
  astPct: number | null;
  oppEfgPct: number | null;
  oppTovPct: number | null;
  oppOrebPct: number | null;
  oppFtRate: number | null;
  smallSample: boolean;
  /** why this row is empty: data not loaded, or never on the floor that way */
  error: string | null;
  /** set when the row subtracts a group size whose NBA.com list looks incomplete: numbers are approximate */
  warning: string | null;
}

export const groupKey = (ids: Iterable<string>): string => [...ids].sort().join("-");

const SIZE_NAMES: Record<number, string> = {
  0: "team totals",
  1: "player on/off totals",
  2: "2-man groups",
  3: "3-man groups",
  4: "4-man groups",
  5: "5-man lineups",
};

const choose = (n: number, k: number): number => (k < 0 || k > n ? 0 : k === 0 ? 1 : (choose(n - 1, k - 1) * n) / k);

/**
 * Share of the expected minutes each loaded size's groups account for: Σ minutes of k-man groups
 * ÷ (C(5, k) × team minutes). 1 = complete. Sizes are left out when team minutes aren't loaded.
 */
export function sizeCoverage(minutesBySize: ReadonlyMap<number, number>): Map<number, number> {
  const team = minutesBySize.get(0);
  const out = new Map<number, number>();
  if (!team || team <= 0) return out;
  for (const [size, total] of minutesBySize) {
    if (size >= 1 && size <= MAX_COMBO_PLAYERS) out.set(size, total / (choose(MAX_COMBO_PLAYERS, size) * team));
  }
  return out;
}

/** Every subset of `xs` (2^n of them; n ≤ 5 here). */
function subsets<T>(xs: T[]): T[][] {
  const out: T[][] = [[]];
  for (const x of xs) for (const s of [...out]) out.push([...s, x]);
  return out;
}

/** The group keys the formula needs for (on, off). */
export function requiredKeys(on: string[], off: string[]): string[] {
  return subsets(off).map((a) => groupKey([...on, ...a]));
}

export function validateSelection(on: string[], off: string[]): string | null {
  if (new Set(on).size !== on.length || new Set(off).size !== off.length) return "A player is listed twice.";
  if (on.some((id) => off.includes(id))) return "A player can't be both on and off the floor.";
  if (on.length + off.length > MAX_COMBO_PLAYERS) {
    return `Pick at most ${MAX_COMBO_PLAYERS} players in total (on + off): NBA.com only reports groups up to five.`;
  }
  return null;
}

const ZERO: GroupTotals = {
  gamesPlayed: 0, minutes: 0, pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, ast: 0, tov: 0, stl: 0, blk: 0, plusMinus: 0,
  opp: { pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, tov: 0 },
};

const NUM_KEYS = ["minutes", "pts", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta", "oreb", "dreb", "ast", "tov", "stl", "blk", "plusMinus"] as const;
const OPP_KEYS = ["pts", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta", "oreb", "dreb", "tov"] as const;

/**
 * Totals with every player in `on` on the floor and every player in `off` off it.
 * `sizes`: group sizes loaded for the season — a needed size that isn't loaded is an error, not zero.
 */
export function comboTotals(
  lookup: (key: string) => GroupTotals | undefined,
  on: string[],
  off: string[],
  sizes: ReadonlySet<number>,
  coverage: ReadonlyMap<number, number> = new Map(),
): { totals: GroupTotals | null; error: string | null; warning: string | null } {
  const invalid = validateSelection(on, off);
  if (invalid) return { totals: null, error: invalid, warning: null };

  const terms = subsets(off);
  const sum: GroupTotals = { ...ZERO, opp: { ...ZERO.opp! } };
  const thin = new Set<number>();
  for (const a of terms) {
    const size = on.length + a.length;
    if (!sizes.has(size)) return { totals: null, error: `NBA.com ${SIZE_NAMES[size]} aren't loaded for this season yet — run the ETL refresh.`, warning: null };
    // a group missing from an incomplete list isn't really zero; only matters when we subtract
    if (off.length && size >= 1 && (coverage.get(size) ?? 1) < MIN_COVERAGE) thin.add(size);
    const g = lookup(groupKey([...on, ...a])) ?? ZERO;
    const sign = a.length % 2 === 0 ? 1 : -1;
    for (const k of NUM_KEYS) sum[k] += sign * g[k];
    if (sum.opp && g.opp) for (const k of OPP_KEYS) sum.opp[k] += sign * g.opp[k];
    else sum.opp = null;
  }
  sum.gamesPlayed = off.length === 0 ? (lookup(groupKey(on))?.gamesPlayed ?? 0) : 0;
  if (sum.minutes < MIN_MINUTES_PER_TERM * terms.length) {
    return { totals: null, error: "Never on the floor in this combination this season.", warning: null };
  }
  const warning = thin.size
    ? `Approximate: NBA.com's ${[...thin].sort().map((s) => SIZE_NAMES[s]).join(" and ")} cover only ${[...thin].sort().map((s) => `${Math.round(100 * coverage.get(s)!)}%`).join(" / ")} of the minutes they should, so the subtraction may miss some.`
    : null;
  return { totals: sum, error: null, warning };
}

/** Ratings and four factors for a set of totals (same formulas as the team profiles). */
export function comboMetrics(t: GroupTotals) {
  const own = possessions(t);
  const opp = t.opp;
  const oppPoss = opp ? possessions(opp) : null;
  const poss = own != null && oppPoss != null ? (own + oppPoss) / 2 : own;
  const oppPts = t.pts - t.plusMinus;
  const ok = poss != null && poss > 0;
  const offRtg = ok ? (100 * t.pts) / poss! : null;
  const defRtg = ok ? (100 * oppPts) / poss! : null;
  return {
    minutes: t.minutes,
    pts: t.pts,
    oppPts,
    plusMinus: t.plusMinus,
    poss: ok ? poss : null,
    offRtg,
    defRtg,
    netRtg: offRtg != null && defRtg != null ? offRtg - defRtg : null,
    pace: ok && t.minutes >= 1 ? (poss! * 48) / t.minutes : null,
    efgPct: efg(t),
    tovPct: tovPct(t),
    orebPct: opp ? orebPct(t, opp) : null,
    ftRate: div(t.fta, t.fga),
    threePaRate: div(t.fg3a, t.fga),
    threePct: div(t.fg3m, t.fg3a),
    astPct: div(t.ast, t.fgm),
    oppEfgPct: opp ? efg(opp) : null,
    oppTovPct: opp ? tovPct(opp) : null,
    oppOrebPct: opp ? orebPct(opp, t) : null,
    oppFtRate: opp ? div(opp.fta, opp.fga) : null,
  };
}

const EMPTY_METRICS = {
  minutes: null, pts: null, oppPts: null, plusMinus: null, poss: null, offRtg: null, defRtg: null, netRtg: null, pace: null,
  efgPct: null, tovPct: null, orebPct: null, ftRate: null, threePaRate: null, threePct: null, astPct: null,
  oppEfgPct: null, oppTovPct: null, oppOrebPct: null, oppFtRate: null,
};

export const rowId = (on: string[], off: string[]) => `on:${groupKey(on)}|off:${groupKey(off)}`;

export function comboRow(
  lookup: (key: string) => GroupTotals | undefined,
  on: string[],
  off: string[],
  sizes: ReadonlySet<number>,
  kind: ComboKind,
  label: string,
  removed: string | null = null,
  coverage?: ReadonlyMap<number, number>,
): ComboRow {
  const { totals, error, warning } = comboTotals(lookup, on, off, sizes, coverage);
  const base = { id: rowId(on, off), kind, on: [...on], off: [...off], removed, label };
  if (!totals) return { ...base, ...EMPTY_METRICS, gamesPlayed: null, smallSample: false, error, warning: null };
  return {
    ...base,
    ...comboMetrics(totals),
    gamesPlayed: off.length === 0 ? totals.gamesPlayed : null,
    smallSample: totals.minutes < SMALL_SAMPLE_MINUTES,
    error: null,
    warning,
  };
}

/** "Dončić + Kessler, no Reaves"; the empty selection is the whole team. */
export function comboLabel(on: string[], off: string[], name: (id: string) => string, teamName = "Team"): string {
  const onPart = on.length ? on.map(name).join(" + ") : off.length ? `${teamName}` : `${teamName}, all minutes`;
  return off.length ? `${onPart}, no ${off.map(name).join(" or ")}` : onPart;
}

/**
 * The selection, then for each selected player the rest of the selection with that player
 * "either way" (any) and "off the floor" (without), then the whole team for scale.
 */
export interface PlannedRow {
  kind: ComboKind;
  on: string[];
  off: string[];
  removed: string | null;
}

export function comparisonPlan(on: string[], off: string[]): PlannedRow[] {
  const plan: PlannedRow[] = [];
  const seen = new Set<string>();
  const add = (kind: ComboKind, o: string[], x: string[], removed: string | null = null) => {
    const id = rowId(o, x);
    if (seen.has(id)) return;
    seen.add(id);
    plan.push({ kind, on: o, off: x, removed });
  };
  if (on.length || off.length) add("selection", on, off);
  for (const p of on) {
    const rest = on.filter((id) => id !== p);
    if (rest.length || off.length) add("any", rest, off, p);
    add("without", rest, [...off, p], p);
  }
  add("team", [], []);
  return plan;
}

export function comparisonRows(
  lookup: (key: string) => GroupTotals | undefined,
  on: string[],
  off: string[],
  sizes: ReadonlySet<number>,
  name: (id: string) => string,
  teamName?: string,
  coverage?: ReadonlyMap<number, number>,
): ComboRow[] {
  return comparisonPlan(on, off).map((p) => comboRow(lookup, p.on, p.off, sizes, p.kind, comboLabel(p.on, p.off, name, teamName), p.removed, coverage));
}

// ── Building group totals from stints (demo seed + tests) ────────────────────

/** One unbroken stretch with the same five on the floor. */
export interface Stint {
  gameId: string;
  players: string[];
  totals: Omit<GroupTotals, "gamesPlayed" | "opp">;
  opp: OppTotals;
}

/**
 * Every group NBA.com would report from these stints: the team (size 0), each player on court
 * (1) and every 2–5-man subset of each five, keyed by groupKey. Real data comes from NBA.com;
 * this exists so synthetic data adds up the same way and the subtraction can be tested.
 */
export function groupsFromStints(stints: Stint[]): Map<string, GroupTotals & { size: number }> {
  const out = new Map<string, GroupTotals & { size: number; games: Set<string> }>();
  for (const s of stints) {
    for (const sub of subsets([...s.players].sort())) {
      const key = groupKey(sub);
      let g = out.get(key);
      if (!g) {
        g = { ...ZERO, opp: { ...ZERO.opp! }, size: sub.length, games: new Set() };
        out.set(key, g);
      }
      for (const k of NUM_KEYS) g[k] += s.totals[k];
      for (const k of OPP_KEYS) g.opp![k] += s.opp[k];
      g.games.add(s.gameId);
    }
  }
  return new Map([...out].map(([k, { games, ...g }]) => [k, { ...g, gamesPlayed: games.size }]));
}
