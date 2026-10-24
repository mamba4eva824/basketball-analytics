/**
 * Box-score derived team profiles (ratings + four factors, both sides of the ball).
 * Formulas: .claude/skills/basketball-metrics/SKILL.md — aggregate totals, then divide.
 */

export interface BoxSide {
  teamId: string;
  pts: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  oreb: number | null;
  dreb: number | null;
  tov: number;
}

export interface GameRecord {
  gameId: string;
  gameDate: Date;
  home: BoxSide;
  away: BoxSide;
}

export interface SideTotals {
  pts: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  /** null once any game in the window lacks offensive rebounds */
  oreb: number | null;
  dreb: number | null;
  tov: number;
  /** possessions summed over games where they are measurable (both sides report OREB) */
  poss: number;
  /** points scored in those same games — the numerator for ratings */
  possPts: number;
  possGames: number;
}

export interface TeamProfile {
  teamId: string;
  games: number;
  wins: number;
  losses: number;
  ppg: number;
  oppPpg: number;
  avgMargin: number;
  /** null when no game in the window has measurable possessions */
  pace: number | null;
  offRtg: number | null;
  defRtg: number | null;
  netRtg: number | null;
  efgPct: number | null;
  tovPct: number | null;
  orebPct: number | null;
  ftRate: number | null;
  threePaRate: number | null;
  threePct: number | null;
  oppEfgPct: number | null;
  oppTovPct: number | null;
  oppOrebPct: number | null;
  oppFtRate: number | null;
  oppThreePct: number | null;
  team: SideTotals;
  opp: SideTotals;
}

/** Box-score possessions; null when OREB is missing (never treat it as 0). */
export function possessions(s: Pick<BoxSide, "fga" | "fta" | "oreb" | "tov">): number | null {
  if (s.oreb == null) return null;
  return s.fga + 0.44 * s.fta - s.oreb + s.tov;
}

function emptyTotals(): SideTotals {
  return { pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, tov: 0, poss: 0, possPts: 0, possGames: 0 };
}

function addSide(t: SideTotals, s: BoxSide, poss: number | null) {
  t.pts += s.pts;
  t.fgm += s.fgm;
  t.fga += s.fga;
  t.fg3m += s.fg3m;
  t.fg3a += s.fg3a;
  t.ftm += s.ftm;
  t.fta += s.fta;
  t.oreb = t.oreb == null || s.oreb == null ? null : t.oreb + s.oreb;
  t.dreb = t.dreb == null || s.dreb == null ? null : t.dreb + s.dreb;
  t.tov += s.tov;
  if (poss != null) {
    t.poss += poss;
    t.possPts += s.pts;
    t.possGames += 1;
  }
}

const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export function efg(t: SideTotals) {
  return div(t.fgm + 0.5 * t.fg3m, t.fga);
}
export function tovPct(t: SideTotals) {
  return div(t.tov, t.fga + 0.44 * t.fta + t.tov);
}
export function orebPct(off: SideTotals, def: SideTotals) {
  if (off.oreb == null || def.dreb == null) return null;
  return div(off.oreb, off.oreb + def.dreb);
}

/**
 * Build one profile per team from its games. With `lastN`, each team's profile uses only its
 * most recent N games (by date).
 */
export function buildTeamProfiles(games: GameRecord[], opts: { lastN?: number } = {}): Map<string, TeamProfile> {
  const byTeam = new Map<string, { game: GameRecord; isHome: boolean }[]>();
  for (const g of games) {
    for (const isHome of [true, false]) {
      const id = isHome ? g.home.teamId : g.away.teamId;
      if (!byTeam.has(id)) byTeam.set(id, []);
      byTeam.get(id)!.push({ game: g, isHome });
    }
  }

  const profiles = new Map<string, TeamProfile>();
  for (const [teamId, entries] of byTeam) {
    entries.sort((a, b) => a.game.gameDate.getTime() - b.game.gameDate.getTime());
    const window = opts.lastN ? entries.slice(-opts.lastN) : entries;
    const team = emptyTotals();
    const opp = emptyTotals();
    let wins = 0;
    for (const { game, isHome } of window) {
      const us = isHome ? game.home : game.away;
      const them = isHome ? game.away : game.home;
      const ourPoss = possessions(us);
      const theirPoss = possessions(them);
      const poss = ourPoss != null && theirPoss != null ? (ourPoss + theirPoss) / 2 : null;
      addSide(team, us, poss);
      addSide(opp, them, poss);
      if (us.pts > them.pts) wins += 1;
    }
    const n = window.length;
    if (n === 0) continue;
    const offRtg = team.possGames ? (100 * team.possPts) / team.poss : null;
    const defRtg = opp.possGames ? (100 * opp.possPts) / opp.poss : null;
    profiles.set(teamId, {
      teamId,
      games: n,
      wins,
      losses: n - wins,
      ppg: team.pts / n,
      oppPpg: opp.pts / n,
      avgMargin: (team.pts - opp.pts) / n,
      pace: team.possGames ? team.poss / team.possGames : null,
      offRtg,
      defRtg,
      netRtg: offRtg != null && defRtg != null ? offRtg - defRtg : null,
      efgPct: efg(team),
      tovPct: tovPct(team),
      orebPct: orebPct(team, opp),
      ftRate: div(team.fta, team.fga),
      threePaRate: div(team.fg3a, team.fga),
      threePct: div(team.fg3m, team.fg3a),
      oppEfgPct: efg(opp),
      oppTovPct: tovPct(opp),
      oppOrebPct: orebPct(opp, team),
      oppFtRate: div(opp.fta, opp.fga),
      oppThreePct: div(opp.fg3m, opp.fg3a),
      team,
      opp,
    });
  }
  return profiles;
}

export interface LeagueBaseline {
  offRtg: number;
  pace: number;
  teams: number;
}

/** League-wide efficiency and pace, weighted by possessions/games (not a mean of team ratings). */
export function leagueBaseline(profiles: Iterable<TeamProfile>): LeagueBaseline | null {
  let pts = 0;
  let poss = 0;
  let games = 0;
  let teams = 0;
  for (const p of profiles) {
    pts += p.team.possPts;
    poss += p.team.poss;
    games += p.team.possGames;
    teams += 1;
  }
  if (poss === 0 || games === 0) return null;
  return { offRtg: (100 * pts) / poss, pace: poss / games, teams };
}
