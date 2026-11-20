/**
 * "When Luka sits": how the team does with one player (the star) off the floor, two ways.
 *
 * 1. Bench minutes (NBA.com group totals, season to date). Built on the Lineup Lab's
 *    inclusion–exclusion (`comboRow`):
 *      team without star          = T(team) − T(star)
 *      teammate P on, star off    = T(P) − T(P, star)
 *      group G on, star off       = T(G) − T(G ∪ star)       (2–4-man groups)
 *    5-man lineups that don't include the star need no subtraction.
 *    These are the TEAM's numbers over those minutes — never a teammate's own box score.
 *
 * 2. Games the star missed (game logs): team results and each teammate's per-game line in games
 *    he didn't play vs games he did. Only games on or after his first game for the team count, so a
 *    mid-season arrival's earlier games aren't "missed".
 *
 * Pure — /api/star-off queries. Spec: basketball-metrics skill → "When Luka sits".
 */
import { SMALL_SAMPLE_MINUTES, comboLabel, comboRow, type ComboRow, type GroupTotals } from "./lineupCombos";
import { buildTeamProfiles, div, type GameRecord } from "./teamProfiles";
import { playerMetricValues, type PlayerGameInput } from "./playerTrend";

/** Luka Dončić — the default star for the section. */
export const DEFAULT_STAR_ID = "1629029";
/** Fewer missed games than this → "small sample" (same threshold as player baselines). */
export const MISSED_GAMES_SMALL_SAMPLE = 5;
/** Best/worst groups shown per size. */
export const TOP_GROUPS = 5;

type Lookup = (key: string) => GroupTotals | undefined;

/** True shooting: PTS / (2 · (FGA + 0.44 · FTA)). */
export function tsPct(t: Pick<GroupTotals, "pts" | "fga" | "fta">): number | null {
  return div(t.pts, 2 * (t.fga + 0.44 * t.fta));
}

export interface StarSplit {
  /** team with the star off the floor */
  off: ComboRow;
  /** team with the star on the floor */
  on: ComboRow;
  /** the whole season, for scale */
  team: ComboRow;
  /** TS% for each (ComboRow carries eFG% but not TS%) */
  tsOff: number | null;
  tsOn: number | null;
  /** share of the team's minutes played without the star */
  shareOff: number | null;
}

/** Team on vs off for the star. `name` labels rows ("Team, no Dončić"). */
export function starSplit(
  lookup: Lookup,
  starId: string,
  sizes: ReadonlySet<number>,
  name: (id: string) => string,
  teamName = "Team",
  coverage?: ReadonlyMap<number, number>,
): StarSplit {
  const off = comboRow(lookup, [], [starId], sizes, "without", comboLabel([], [starId], name, teamName), starId, coverage);
  const on = comboRow(lookup, [starId], [], sizes, "selection", comboLabel([starId], [], name, teamName), null, coverage);
  const team = comboRow(lookup, [], [], sizes, "team", comboLabel([], [], name, teamName), null, coverage);
  const teamTotals = lookup("");
  const starTotals = lookup(starId);
  const offTotals = teamTotals && starTotals ? subtract(teamTotals, starTotals) : null;
  return {
    off,
    on,
    team,
    tsOff: off.error || !offTotals ? null : tsPct(offTotals),
    tsOn: on.error || !starTotals ? null : tsPct(starTotals),
    shareOff: off.minutes != null && team.minutes ? off.minutes / team.minutes : null,
  };
}

function subtract(a: GroupTotals, b: GroupTotals): Pick<GroupTotals, "pts" | "fga" | "fta"> {
  return { pts: a.pts - b.pts, fga: a.fga - b.fga, fta: a.fta - b.fta };
}

export interface TeammateSplit {
  playerId: string;
  /** team with this teammate on and the star off */
  without: ComboRow;
  /** team with both on */
  with: ComboRow;
}

/**
 * Each teammate's minutes without the star and the team's results in them, next to the same
 * teammate alongside the star. Sorted: enough minutes first, by net rating without the star;
 * small samples after, by minutes; never-without-the-star last.
 */
export function teammateSplits(
  lookup: Lookup,
  starId: string,
  teammateIds: string[],
  sizes: ReadonlySet<number>,
  name: (id: string) => string,
  coverage?: ReadonlyMap<number, number>,
): TeammateSplit[] {
  const rows = teammateIds
    .filter((id) => id !== starId)
    .map((id) => ({
      playerId: id,
      without: comboRow(lookup, [id], [starId], sizes, "without", comboLabel([id], [starId], name), starId, coverage),
      with: comboRow(lookup, [id, starId], [], sizes, "selection", comboLabel([id, starId], [], name), null, coverage),
    }));
  const tier = (r: TeammateSplit) => (r.without.error || r.without.minutes == null ? 2 : r.without.smallSample ? 1 : 0);
  return rows.sort((a, b) => {
    const t = tier(a) - tier(b);
    if (t) return t;
    if (tier(a) === 0) return (b.without.netRtg ?? -Infinity) - (a.without.netRtg ?? -Infinity);
    return (b.without.minutes ?? 0) - (a.without.minutes ?? 0);
  });
}

export interface GroupRef {
  groupKey: string;
  groupSize: number;
}

export interface GroupsWithout {
  /** 2-man groups with at least SMALL_SAMPLE_MINUTES without the star: best and worst by net rating */
  bestPairs: ComboRow[];
  worstPairs: ComboRow[];
  /** 3-man groups with enough minutes without the star, best by net rating */
  bestTrios: ComboRow[];
  /** 5-man lineups without the star, most used first (small samples tagged, not dropped) */
  topFives: ComboRow[];
}

/** Lineups that play without the star. `groups`: every loaded group for the team-season. */
export function groupsWithout(
  lookup: Lookup,
  starId: string,
  groups: GroupRef[],
  sizes: ReadonlySet<number>,
  name: (id: string) => string,
  coverage?: ReadonlyMap<number, number>,
  top = TOP_GROUPS,
): GroupsWithout {
  const ids = (key: string) => key.split("-");
  const without = (size: number) =>
    groups
      .filter((g) => g.groupSize === size && !ids(g.groupKey).includes(starId))
      .map((g) => comboRow(lookup, ids(g.groupKey), [starId], sizes, "without", comboLabel(ids(g.groupKey), [], name), starId, coverage))
      .filter((r) => !r.error && r.minutes != null && r.minutes >= SMALL_SAMPLE_MINUTES && r.netRtg != null);
  const byNet = (a: ComboRow, b: ComboRow) => b.netRtg! - a.netRtg!;

  const pairs = without(2).sort(byNet);
  const bestPairs = pairs.slice(0, top);
  const worstPairs = pairs.slice(Math.max(top, pairs.length - top)).reverse();
  const bestTrios = without(3).sort(byNet).slice(0, top);

  // a five without the star already has him off: the NBA.com row as is
  const topFives = groups
    .filter((g) => g.groupSize === 5 && !ids(g.groupKey).includes(starId))
    .map((g) => comboRow(lookup, ids(g.groupKey), [], sizes, "selection", comboLabel(ids(g.groupKey), [], name), null, coverage))
    .filter((r) => !r.error && r.minutes != null)
    .sort((a, b) => b.minutes! - a.minutes!)
    .slice(0, top);

  return { bestPairs, worstPairs, bestTrios, topFives };
}

/** Lineup Lab link for a row: its players on, the star off (the lab takes at most five in total). */
export function labHref(row: Pick<ComboRow, "on" | "off">): string {
  const on = row.on.join(",");
  const off = row.on.length + row.off.length <= 5 ? row.off.join(",") : "";
  const qs = [on && `on=${on}`, off && `off=${off}`].filter(Boolean).join("&");
  return qs ? `/lineups?${qs}` : "/lineups";
}

// ── Games the star missed ────────────────────────────────────────────────────

export interface FocusGameLog {
  gameId: string;
  playerId: string;
  minutes: number | null;
  started: boolean;
  pts: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  fta: number;
  reb: number;
  ast: number;
  tov: number;
  plusMinus: number | null;
}

export interface GameSetSummary {
  games: number;
  wins: number;
  losses: number;
  offRtg: number | null;
  defRtg: number | null;
  netRtg: number | null;
  /** box-score possessions per game (box scores carry no minutes) */
  pace: number | null;
}

export interface TeammateGameSplit {
  playerId: string;
  /** games played in each set (minutes > 0) */
  gamesWithout: number;
  gamesWith: number;
  /** per-game lines; null when he didn't play in that set */
  without: Pick<ReturnType<typeof playerMetricValues>, "pts" | "reb" | "ast" | "min" | "tsPct" | "usgPct"> | null;
  with: Pick<ReturnType<typeof playerMetricValues>, "pts" | "reb" | "ast" | "min" | "tsPct" | "usgPct"> | null;
}

export interface StandInStarter {
  playerId: string;
  /** starts in the games the star missed */
  startsWithout: number;
  /** share of the star's games this player started (null if he played none of them) */
  startRateWith: number | null;
}

export interface MissedGameRow {
  gameId: string;
  gameDate: Date;
  opponentId: string;
  isHome: boolean;
  won: boolean;
  teamPts: number;
  oppPts: number;
}

export interface MissedGames {
  /** the star logged minutes for the team in at least one game */
  starPlayed: boolean;
  /** games before the star's first game for the team that were left out */
  gamesBeforeArrival: number;
  withStar: GameSetSummary;
  withoutStar: GameSetSummary;
  smallSample: boolean;
  games: MissedGameRow[];
  teammates: TeammateGameSplit[];
  standIns: StandInStarter[];
}

const EMPTY_SUMMARY: GameSetSummary = { games: 0, wins: 0, losses: 0, offRtg: null, defRtg: null, netRtg: null, pace: null };

function summarize(teamId: string, games: GameRecord[]): GameSetSummary {
  const p = buildTeamProfiles(games).get(teamId);
  if (!p) return EMPTY_SUMMARY;
  return { games: p.games, wins: p.wins, losses: p.losses, offRtg: p.offRtg, defRtg: p.defRtg, netRtg: p.netRtg, pace: p.pace };
}

const pickLine = (v: ReturnType<typeof playerMetricValues>) => ({ pts: v.pts, reb: v.reb, ast: v.ast, min: v.min, tsPct: v.tsPct, usgPct: v.usgPct });

/**
 * Team record/ratings and teammates' lines in games the star missed vs played.
 * `games`: the team's finished games; `logs`: every team player's log in them.
 */
export function missedGames(teamId: string, starId: string, games: GameRecord[], logs: FocusGameLog[]): MissedGames {
  const played = (l: FocusGameLog) => (l.minutes ?? 0) > 0;
  const byDate = [...games].sort((a, b) => a.gameDate.getTime() - b.gameDate.getTime());
  const starGames = new Set(logs.filter((l) => l.playerId === starId && played(l)).map((l) => l.gameId));
  const firstIdx = byDate.findIndex((g) => starGames.has(g.gameId));
  if (firstIdx < 0) {
    return { starPlayed: false, gamesBeforeArrival: 0, withStar: EMPTY_SUMMARY, withoutStar: EMPTY_SUMMARY, smallSample: true, games: [], teammates: [], standIns: [] };
  }
  const inScope = byDate.slice(firstIdx);
  const withG = inScope.filter((g) => starGames.has(g.gameId));
  const withoutG = inScope.filter((g) => !starGames.has(g.gameId));
  const withoutIds = new Set(withoutG.map((g) => g.gameId));
  const scopeIds = new Set(inScope.map((g) => g.gameId));

  // team totals per game for usage: the team's own FGA/FTA/TOV and the sum of its players' minutes
  const gameById = new Map(inScope.map((g) => [g.gameId, g]));
  const teamMin = new Map<string, number>();
  for (const l of logs) if (scopeIds.has(l.gameId)) teamMin.set(l.gameId, (teamMin.get(l.gameId) ?? 0) + (l.minutes ?? 0));
  const ownSide = (g: GameRecord) => (g.home.teamId === teamId ? g.home : g.away);

  const inputs = new Map<string, { without: PlayerGameInput[]; with: PlayerGameInput[]; startsWithout: number; startsWith: number }>();
  for (const l of logs) {
    if (l.playerId === starId || !scopeIds.has(l.gameId) || !played(l)) continue;
    const g = gameById.get(l.gameId)!;
    const us = ownSide(g);
    const them = g.home.teamId === teamId ? g.away : g.home;
    const input: PlayerGameInput = {
      gameId: l.gameId, gameDate: g.gameDate, opponentId: them.teamId, won: us.pts > them.pts,
      min: l.minutes!, pts: l.pts, fgm: l.fgm, fga: l.fga, fg3m: l.fg3m, fg3a: l.fg3a, fta: l.fta,
      reb: l.reb, ast: l.ast, tov: l.tov, plusMinus: l.plusMinus,
      team: { fga: us.fga, fta: us.fta, tov: us.tov, min: teamMin.get(l.gameId) ?? 0 },
    };
    const e = inputs.get(l.playerId) ?? { without: [], with: [], startsWithout: 0, startsWith: 0 };
    const missed = withoutIds.has(l.gameId);
    (missed ? e.without : e.with).push(input);
    if (l.started && missed) e.startsWithout++;
    else if (l.started) e.startsWith++;
    inputs.set(l.playerId, e);
  }

  const teammates: TeammateGameSplit[] = [...inputs]
    .filter(([, e]) => e.without.length > 0)
    .map(([playerId, e]) => ({
      playerId,
      gamesWithout: e.without.length,
      gamesWith: e.with.length,
      without: pickLine(playerMetricValues(e.without)),
      with: e.with.length ? pickLine(playerMetricValues(e.with)) : null,
    }))
    .sort((a, b) => (b.without?.min ?? 0) - (a.without?.min ?? 0));

  const standIns: StandInStarter[] = [...inputs]
    .filter(([, e]) => e.startsWithout > 0)
    .map(([playerId, e]) => ({
      playerId,
      startsWithout: e.startsWithout,
      startRateWith: withG.length ? e.startsWith / withG.length : null,
    }))
    .sort((a, b) => (a.startRateWith ?? 0) - (b.startRateWith ?? 0) || b.startsWithout - a.startsWithout);

  return {
    starPlayed: true,
    gamesBeforeArrival: firstIdx,
    withStar: summarize(teamId, withG),
    withoutStar: summarize(teamId, withoutG),
    smallSample: withoutG.length < MISSED_GAMES_SMALL_SAMPLE,
    games: withoutG
      .map((g) => {
        const us = ownSide(g);
        const them = g.home.teamId === teamId ? g.away : g.home;
        return { gameId: g.gameId, gameDate: g.gameDate, opponentId: them.teamId, isHome: g.home.teamId === teamId, won: us.pts > them.pts, teamPts: us.pts, oppPts: them.pts };
      })
      .reverse(),
    teammates,
    standIns,
  };
}
