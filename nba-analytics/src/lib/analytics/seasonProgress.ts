/**
 * Season progress: how the focus team's chosen metrics (default: turnovers, the glass at both
 * ends, defense and net rating) move through the season — league rank after every game, last 10
 * vs season, 10-game blocks and months against the league, and the strengths, weaknesses and
 * movers across every ranked metric. Pure: /api/progress loads the games.
 * Spec: basketball-metrics skill → "Season progress".
 */
import { buildTeamProfiles, type GameRecord, type TeamProfile } from "./teamProfiles";
import { METRIC_DIRECTION, RANKED_METRICS, STYLE_METRICS, rankProfiles, type RankedMetric } from "./ranks";

/** The focus areas shown until the viewer pins others. */
export const FOCUS_DEFAULT: RankedMetric[] = ["tovPct", "orebPct", "oppOrebPct", "defRtg", "netRtg"];
/** "Recent form" window for the scorecard. */
export const RECENT_GAMES = 10;
/** Block size for the segment table. */
export const SEGMENT_GAMES = 10;
/**
 * Movers compare today's rank with the rank this many of our games ago — or, early in the season,
 * with the rank after game SMALL_SAMPLE_GAMES (ranks before that are small-sample noise).
 */
export const MOVER_LOOKBACK = 15;
/** …and need to have moved at least this many places. */
export const MOVER_MIN_PLACES = 3;
/** Fewer games than this in a window → small-sample tag (same as the team policy). */
export const SMALL_SAMPLE_GAMES = 5;

/**
 * Last 10 vs season counts as "improving"/"slipping" only past this gap (in the metric's own
 * units); anything smaller is "steady". Style metrics (pace, 3PA rate) are never better or worse.
 */
export const TREND_MIN_CHANGE: Record<RankedMetric, number> = {
  netRtg: 2, offRtg: 2, defRtg: 2, pace: 1.5,
  efgPct: 0.01, tovPct: 0.01, orebPct: 0.01, ftRate: 0.02, threePaRate: 0.02, threePct: 0.01,
  oppEfgPct: 0.01, oppTovPct: 0.01, oppOrebPct: 0.01, oppFtRate: 0.02, oppThreePct: 0.01,
  ppg: 3, oppPpg: 3,
};

/** Metrics that say how good, not how fast: strengths/weaknesses/movers skip style and raw points. */
export const QUALITY_METRICS: RankedMetric[] = RANKED_METRICS.filter((m) => !STYLE_METRICS.has(m) && m !== "ppg" && m !== "oppPpg");

export type MetricValues = Record<RankedMetric, number | null>;

export interface ProgressPoint {
  gameId: string;
  /** game date (ET day at 00:00 UTC, like GameBoxScore) */
  gameDate: Date;
  /** 1-based: our Nth game */
  gameNo: number;
  opponentId: string;
  won: boolean;
  /** season to date after this game */
  toDate: MetricValues;
  /** league rank of `toDate`, among every team's season to date on that day */
  rank: Record<RankedMetric, number | null>;
  /** our last RECENT_GAMES games ending with this one */
  recent: MetricValues;
  /** league-wide value over every game played through that day */
  league: MetricValues;
  /** teams with a season profile on that day (the rank's "of N") */
  rankedTeams: number;
}

export type TrendVerdict = "improving" | "slipping" | "steady" | null;

export interface FocusCard {
  metric: RankedMetric;
  season: number | null;
  rank: number | null;
  recent: number | null;
  /** rank of our last-10 profile among every team's last 10 */
  recentRank: number | null;
  league: number | null;
  /** last 10 vs season, from the "better" direction; null for style metrics or missing values */
  trend: TrendVerdict;
  /** places gained (+) or lost (−) since game `SeasonProgress.moversSince`; null before there's a baseline */
  rankChange: number | null;
}

export interface Segment {
  label: string;
  from: Date;
  to: Date;
  games: number;
  wins: number;
  values: MetricValues;
  /** our rank among every team's profile over the same dates */
  rank: Record<RankedMetric, number | null>;
  league: MetricValues;
  smallSample: boolean;
}

export interface MetricStanding {
  metric: RankedMetric;
  rank: number;
  value: number | null;
  /** for movers: places gained (+) or lost (−) */
  change?: number;
}

export interface SeasonProgress {
  games: number;
  /** the game number rank changes are measured from; null until we're past the small-sample games */
  moversSince: number | null;
  rankedTeams: number;
  history: ProgressPoint[];
  cards: Record<RankedMetric, FocusCard>;
  blocks: Segment[];
  months: Segment[];
  strengths: MetricStanding[];
  weaknesses: MetricStanding[];
  risers: MetricStanding[];
  fallers: MetricStanding[];
}

// ── Building blocks ──────────────────────────────────────────────────────────

const LEAGUE = "__league__";

const pick = (p: TeamProfile | undefined): MetricValues => {
  const out = {} as MetricValues;
  for (const m of RANKED_METRICS) out[m] = p ? p[m] : null;
  return out;
};

/**
 * League-wide values over these games, with the season formulas: every side of every game is
 * pooled into one "team" (totals first, then divide), so league eFG% is all makes over all
 * attempts, league DRtg = league ORtg, net rating 0.
 */
export function leagueValues(games: GameRecord[]): MetricValues {
  const pooled = games.map((g) => ({ ...g, home: { ...g.home, teamId: LEAGUE }, away: { ...g.away, teamId: LEAGUE } }));
  return pick(buildTeamProfiles(pooled).get(LEAGUE));
}

const better = (metric: RankedMetric, a: number, b: number) => (METRIC_DIRECTION[metric] === "higher" ? a > b : a < b);

export function trendVerdict(metric: RankedMetric, recent: number | null, season: number | null): TrendVerdict {
  if (STYLE_METRICS.has(metric) || recent == null || season == null) return null;
  if (Math.abs(recent - season) < TREND_MIN_CHANGE[metric]) return "steady";
  return better(metric, recent, season) ? "improving" : "slipping";
}

const ourGames = (games: GameRecord[], teamId: string) =>
  games.filter((g) => g.home.teamId === teamId || g.away.teamId === teamId).sort((a, b) => a.gameDate.getTime() - b.gameDate.getTime());

/** Our profile over `mine`, ranked among every team's profile over the same date range. */
function segment(label: string, mine: GameRecord[], all: GameRecord[], teamId: string): Segment {
  const from = mine[0].gameDate;
  const to = mine[mine.length - 1].gameDate;
  const inRange = all.filter((g) => g.gameDate >= from && g.gameDate <= to);
  // our games in [from, to] are exactly `mine` (blocks and months are contiguous), so our profile
  // over the range is ours over the segment, ranked against everyone's over the same dates
  const profiles = buildTeamProfiles(inRange);
  const ours = profiles.get(teamId);
  const ranks = rankProfiles(profiles.values()).get(teamId)!;
  return {
    label, from, to,
    games: mine.length,
    wins: ours?.wins ?? 0,
    values: pick(ours),
    rank: ranks,
    league: leagueValues(inRange),
    smallSample: mine.length < SMALL_SAMPLE_GAMES,
  };
}

const MONTH = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

// ── Assembly ─────────────────────────────────────────────────────────────────

export function seasonProgress(games: GameRecord[], teamId: string): SeasonProgress {
  const all = [...games].sort((a, b) => a.gameDate.getTime() - b.gameDate.getTime());
  const mine = ourGames(all, teamId);

  // League rank after each of our games: every team's season to date through that day
  const history: ProgressPoint[] = mine.map((g, i) => {
    const through = all.filter((x) => x.gameDate <= g.gameDate);
    const profiles = buildTeamProfiles(through);
    const ranks = rankProfiles(profiles.values()).get(teamId)!;
    const isHome = g.home.teamId === teamId;
    const us = isHome ? g.home : g.away;
    const them = isHome ? g.away : g.home;
    return {
      gameId: g.gameId,
      gameDate: g.gameDate,
      gameNo: i + 1,
      opponentId: them.teamId,
      won: us.pts > them.pts,
      toDate: pick(profiles.get(teamId)),
      rank: ranks,
      recent: pick(buildTeamProfiles(mine.slice(Math.max(0, i - RECENT_GAMES + 1), i + 1)).get(teamId)),
      league: leagueValues(through),
      rankedTeams: profiles.size,
    };
  });

  const now = history[history.length - 1];
  const thenIdx = Math.max(SMALL_SAMPLE_GAMES - 1, history.length - 1 - MOVER_LOOKBACK);
  const then = thenIdx < history.length - 1 ? history[thenIdx] : null;
  const recentProfiles = buildTeamProfiles(all, { lastN: RECENT_GAMES });
  const recentRanks = rankProfiles(recentProfiles.values()).get(teamId);

  const cards = {} as Record<RankedMetric, FocusCard>;
  for (const m of RANKED_METRICS) {
    const season = now?.toDate[m] ?? null;
    const recent = now?.recent[m] ?? null;
    const r = now?.rank[m] ?? null;
    const r0 = then?.rank[m] ?? null;
    cards[m] = {
      metric: m,
      season,
      rank: r,
      recent,
      recentRank: recentRanks?.[m] ?? null,
      league: now?.league[m] ?? null,
      trend: trendVerdict(m, recent, season),
      rankChange: r != null && r0 != null ? r0 - r : null,
    };
  }

  const blocks: Segment[] = [];
  for (let i = 0; i < mine.length; i += SEGMENT_GAMES) {
    const chunk = mine.slice(i, i + SEGMENT_GAMES);
    blocks.push(segment(`Games ${i + 1}–${i + chunk.length}`, chunk, all, teamId));
  }
  const byMonth = new Map<string, GameRecord[]>();
  for (const g of mine) {
    const key = MONTH.format(g.gameDate);
    byMonth.set(key, [...(byMonth.get(key) ?? []), g]);
  }
  const months = [...byMonth].map(([label, gs]) => segment(label, gs, all, teamId));

  const n = now?.rankedTeams ?? 0;
  const third = Math.ceil(n / 3);
  const standing = (m: RankedMetric, change?: number): MetricStanding => ({ metric: m, rank: now!.rank[m]!, value: now!.toDate[m], ...(change != null ? { change } : {}) });
  const rankedNow = QUALITY_METRICS.filter((m) => now?.rank[m] != null);
  const movers = rankedNow
    .filter((m) => cards[m].rankChange != null && Math.abs(cards[m].rankChange!) >= MOVER_MIN_PLACES)
    .map((m) => standing(m, cards[m].rankChange!));

  return {
    games: mine.length,
    moversSince: then?.gameNo ?? null,
    rankedTeams: n,
    history,
    cards,
    blocks,
    months,
    strengths: rankedNow.filter((m) => now!.rank[m]! <= third).map((m) => standing(m)).sort((a, b) => a.rank - b.rank),
    weaknesses: rankedNow.filter((m) => now!.rank[m]! > n - third).map((m) => standing(m)).sort((a, b) => b.rank - a.rank),
    risers: movers.filter((x) => x.change! > 0).sort((a, b) => b.change! - a.change!),
    fallers: movers.filter((x) => x.change! < 0).sort((a, b) => a.change! - b.change!),
  };
}
