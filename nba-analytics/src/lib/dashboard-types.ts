/**
 * Response contracts for the aggregate endpoints:
 *   GET /api/dashboard/team/[teamId]  → TeamDashboardData
 *   GET /api/matchup                  → MatchupData
 *   GET /api/live                     → LiveGameResponse
 *   GET /api/schedule                 → ScheduleData
 *   GET /api/advanced/team/[teamId]   → AdvancedTeamData
 *   GET /api/reports                  → ReportMeta[]
 *   GET /api/reports/[slug]           → ReportContent
 * Percentages are 0–1 decimals; dates are ISO strings.
 */
import type { FactorEdge } from "@/lib/analytics/matchup";
import type { RankedMetric } from "@/lib/analytics/ranks";
import type { RosterStatus } from "@/lib/analytics/roster";
import type { FormSummary, Trend } from "@/lib/analytics/form";
import type { LiveGameData } from "@/lib/analytics/live";
import type { ScheduleEntry, ScheduleSummary } from "@/lib/analytics/schedule";

export type { FactorEdge, RankedMetric, RosterStatus, FormSummary, Trend };
export type {
  FoulStatus,
  LiveGameData,
  LiveLineupStint,
  LivePlay,
  LivePlayerLine,
  LiveRun,
  LiveShot,
  LiveTeamFactors,
  LiveTeamView,
  MarginPoint,
} from "@/lib/analytics/live";
export type { ScheduleState, ScheduleSummary } from "@/lib/analytics/schedule";

export interface TeamRefLite {
  id: string;
  abbreviation: string;
  name: string;
  nickname: string;
  conference: string;
  primaryColor: string | null;
}

export interface SeasonInfo {
  id: string;
  previous: string;
  displayName: string;
  /** true when the DB holds synthetic seed data — the UI must say so */
  isDemo: boolean;
}

export interface MetricWithRank {
  value: number | null;
  rank: number | null;
}

export interface TeamProfileView {
  games: number;
  wins: number;
  losses: number;
  metrics: Record<RankedMetric, MetricWithRank>;
}

export interface StandingView {
  conferenceRank: number | null;
  streak: string | null;
  lastTen: string | null;
  home: string | null;
  away: string | null;
  gamesBehind: number | null;
}

export interface TeamSnapshot {
  team: TeamRefLite;
  season: TeamProfileView | null;
  last10: TeamProfileView | null;
  standing: StandingView | null;
}

export interface PlayerLine {
  season: string;
  teamAbbr: string | null;
  gamesPlayed: number;
  /** from game-log starter flags; null when they don't cover every game (e.g. last season) */
  gamesStarted: number | null;
  minutes: number | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
  turnovers: number | null;
  fgPct: number | null;
  threePct: number | null;
  threeAttempts: number | null;
  ftPct: number | null;
  tsPct: number | null;
  usageRate: number | null;
  plusMinus: number | null;
  netRating: number | null;
}

export interface InjuryView {
  playerId: string | null;
  playerName: string;
  teamId: string;
  status: string;
  injuryType: string | null;
  detail: string | null;
  returnDate: string | null;
  fetchedAt: string;
}

export interface RosterRow {
  player: {
    id: string;
    fullName: string;
    position: string | null;
    jersey: string | null;
    headshotUrl: string | null;
  };
  status: RosterStatus;
  current: PlayerLine | null;
  /** previous-season line (possibly with another team) */
  baseline: PlayerLine | null;
  last5: FormSummary;
  pointsTrend: Trend | null;
  smallSample: boolean;
  injury: InjuryView | null;
}

export interface GameResultView {
  gameId: string;
  date: string;
  opponent: TeamRefLite;
  homeAway: "HOME" | "AWAY";
  result: "W" | "L";
  points: number;
  oppPoints: number;
}

export interface UpcomingGameView {
  gameId: string;
  dateUtc: string;
  statusText: string | null;
  opponent: TeamRefLite;
  homeAway: "HOME" | "AWAY";
  arena: string | null;
  nationalTv: string | null;
}

export interface RatingTrendPoint {
  gameId: string;
  date: string;
  opponentAbbr: string;
  result: "W" | "L";
  offRtg: number;
  defRtg: number;
  netRtg: number;
  /** rolling mean of netRtg over the last 5 games (incl. this one) */
  rollingNet: number;
}

export interface RotationView {
  games: { gameId: string; date: string; opponentAbbr: string; result: "W" | "L" }[];
  players: { playerId: string; name: string; status: RosterStatus | null; minutes: (number | null)[]; started: boolean[] }[];
}

export interface StartingUnitView {
  players: { id: string; name: string }[];
  games: number;
  wins: number;
  losses: number;
  avgMargin: number;
  lastUsed: string;
}

export interface LineupView {
  players: { id: string; name: string }[];
  gamesPlayed: number;
  minutes: number;
  netRating: number | null;
  offRating: number | null;
  defRating: number | null;
}

/** Raw per-game series; the UI derives trends with plusMinusTrend() from src/lib/analytics. */
export interface PlusMinusSeriesView {
  games: { gameId: string; date: string; opponentAbbr: string; won: boolean }[];
  players: {
    playerId: string;
    name: string;
    status: RosterStatus;
    /** last date this player logged a game for another team this season (traded / signed mid-season) */
    joinedAfter: string | null;
    currentInjury: string | null;
    lines: { gameId: string; minutes: number | null; plusMinus: number | null; dnp: boolean; dnpReason: string | null }[];
  }[];
}

export interface LeagueView {
  teams: number;
  offRtg: number;
  pace: number;
}

export interface TeamDashboardData {
  season: SeasonInfo;
  snapshot: TeamSnapshot;
  league: LeagueView | null;
  ratingTrend: RatingTrendPoint[];
  roster: RosterRow[];
  rosterSummary: {
    returning: number;
    new: number;
    rookie: number;
    /** share of this season's minutes played by new + rookie players */
    newcomerMinutesShare: number | null;
  };
  rotation: RotationView;
  plusMinus: PlusMinusSeriesView;
  startingLineups: { units: StartingUnitView[]; gamesMissingStarterData: number };
  topLineups: LineupView[];
  recentGames: GameResultView[];
  upcoming: UpcomingGameView[];
  injuriesFetchedAt: string | null;
  lastUpdated: string | null;
  dataNotes: string[];
}

export interface KeyPlayerView extends RosterRow {
  teamId: string;
}

export interface ProjectionView {
  ourPoints: number;
  theirPoints: number;
  ourWinProb: number;
  pace: number;
  smallSample: boolean;
  neutral: boolean;
}

export interface MatchupData {
  season: SeasonInfo;
  /** "YYYY-MM-DD" when built as of a past date (only earlier games counted); null = now */
  asOf: string | null;
  us: TeamSnapshot;
  them: TeamSnapshot;
  league: LeagueView | null;
  /** next scheduled meeting; null if none on the schedule */
  game: UpcomingGameView | null;
  /** how the opponent was chosen */
  opponentSource: "query" | "next-game" | "last-game" | "fallback";
  opponentOptions: { team: TeamRefLite; nextMeetingUtc: string | null }[];
  projection: ProjectionView | null;
  edges: FactorEdge[];
  headToHead: GameResultView[];
  keyPlayers: { ours: KeyPlayerView[]; theirs: KeyPlayerView[] };
  recentForm: { ours: GameResultView[]; theirs: GameResultView[] };
  /** full injury report for both teams (not just key players) */
  injuries: { ours: InjuryView[]; theirs: InjuryView[] };
  injuriesFetchedAt: string | null;
  dataNotes: string[];
}

// ── /api/live ────────────────────────────────────────────────────────────────

export interface LivePregameTeam {
  teamId: string;
  tricode: string;
  city: string;
  name: string;
  wins: number;
  losses: number;
}

export interface LivePregameView {
  gameId: string;
  tipoffUtc: string;
  statusText: string;
  isHome: boolean;
  focus: LivePregameTeam;
  opponent: LivePregameTeam;
}

/** GET /api/live/status — whether the focus team is playing right now. */
export interface LiveStatus {
  gameId: string | null;
  live: boolean;
}

/** Today's focus-team game from the NBA live feed: in progress / final, not yet tipped, or none today. */
export type LiveGameResponse =
  | { kind: "live"; game: LiveGameData }
  | { kind: "pregame"; pregame: LivePregameView }
  | { kind: "none"; next: UpcomingGameView | null };

// ── /api/schedule ────────────────────────────────────────────────────────────

export interface ScheduleGameView extends Omit<ScheduleEntry, "opponentId"> {
  tipoffUtc: string;
  /** league (ET) calendar date "YYYY-MM-DD" */
  dateEt: string;
  statusText: string | null;
  opponent: TeamRefLite;
  arena: string | null;
  nationalTv: string | null;
  /** e.g. "Emirates NBA Cup" */
  label: string | null;
}

export interface ScheduleData {
  season: SeasonInfo;
  /** today's league (ET) date */
  today: string;
  games: ScheduleGameView[];
  summary: ScheduleSummary;
  /** regular-season games not on the schedule yet (82 − scheduled) */
  unscheduled: number;
}

// ── /api/advanced/team/[teamId] ──────────────────────────────────────────────

export interface MetricTrendPointView {
  gameId: string;
  date: string;
  opponentAbbr: string;
  result: "W" | "L";
  /** this game alone */
  game: Record<RankedMetric, number | null>;
  /** last `rollingWindow` games, aggregated (totals first, then divide) */
  rolling: Record<RankedMetric, number | null>;
  /** season to date through this game */
  toDate: Record<RankedMetric, number | null>;
}

export interface AdvancedTeamData {
  season: SeasonInfo;
  team: TeamRefLite;
  rollingWindow: number;
  /** oldest → newest */
  games: MetricTrendPointView[];
  /** full-season value and rank among teams that have played */
  seasonMetrics: Record<RankedMetric, MetricWithRank>;
  rankedTeams: number;
}

// ── /api/reports ─────────────────────────────────────────────────────────────

export type ReportKind = "pregame" | "postgame";

/** A saved markdown report in scouting/ (written by the scouting-report / postgame-report skills). */
export interface ReportMeta {
  slug: string;
  kind: ReportKind;
  /** game date (ET) "YYYY-MM-DD" */
  date: string;
  /** shared by a game's pre- and post-game reports, e.g. "2026-10-25-LAL-at-UTA" */
  gameKey: string;
  opponentAbbr: string;
  homeAway: "HOME" | "AWAY";
  /** the report's first heading */
  title: string;
}

export interface ReportContent extends ReportMeta {
  markdown: string;
}
