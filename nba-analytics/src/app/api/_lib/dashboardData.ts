/**
 * Server-side loaders shared by /api/dashboard/team/[teamId] and /api/matchup.
 * Queries + assembly only — all metric math lives in src/lib/analytics.
 */
import { prisma } from '@/app/api/_lib/prisma'
import { previousSeason, seasonStartYear } from '@/lib/constants'
import { buildTeamProfiles, leagueBaseline, type GameRecord, type LeagueBaseline, type TeamProfile } from '@/lib/analytics/teamProfiles'
import { RANKED_METRICS, rankProfiles, type TeamRanks } from '@/lib/analytics/ranks'
import { classifyPlayer, roleMinutes } from '@/lib/analytics/roster'
import { summarizeForm, trendOf, type LogLine } from '@/lib/analytics/form'
import { SMALL_SAMPLE_GAMES } from '@/lib/analytics/projection'
import type {
  GameResultView,
  InjuryView,
  LeagueView,
  PlayerLine,
  RosterRow,
  SeasonInfo,
  StandingView,
  TeamProfileView,
  TeamRefLite,
  TeamSnapshot,
  UpcomingGameView,
} from '@/lib/dashboard-types'

export const DEMO_MARKER = '(demo data)'

// ── Season + teams ───────────────────────────────────────────────────────────

export async function getSeasonInfo(season: string): Promise<SeasonInfo> {
  const row = await prisma.season.findUnique({ where: { id: season } })
  const displayName = row?.displayName ?? `${season} Season`
  return {
    id: season,
    previous: previousSeason(season),
    displayName,
    isDemo: displayName.includes(DEMO_MARKER),
  }
}

export async function loadTeamRefs(): Promise<Map<string, TeamRefLite>> {
  const teams = await prisma.team.findMany({
    select: { id: true, abbreviation: true, name: true, nickname: true, conference: true, primaryColor: true },
    orderBy: { name: 'asc' },
  })
  return new Map(teams.map((t) => [t.id, { ...t, conference: t.conference as string }]))
}

// ── League games → profiles + ranks ──────────────────────────────────────────

export interface LeagueContext {
  records: GameRecord[]
  season: Map<string, TeamProfile>
  last10: Map<string, TeamProfile>
  seasonRanks: Map<string, TeamRanks>
  last10Ranks: Map<string, TeamRanks>
  baseline: LeagueBaseline | null
  lastUpdated: Date | null
}

type BoxScoreRow = Awaited<ReturnType<typeof prisma.gameBoxScore.findMany>>[number]

export function toGameRecord(g: BoxScoreRow): GameRecord {
  return {
    gameId: g.gameId,
    gameDate: g.gameDate,
    home: {
      teamId: g.homeTeamId,
      pts: g.homePoints,
      fgm: g.homeFieldGoals,
      fga: g.homeFieldGoalAtt,
      fg3m: g.homeThreePointers,
      fg3a: g.homeThreePointAtt,
      ftm: g.homeFreeThrows,
      fta: g.homeFreeThrowAtt,
      oreb: g.homeReboundsOff,
      dreb: g.homeReboundsDef,
      tov: g.homeTurnovers,
    },
    away: {
      teamId: g.awayTeamId,
      pts: g.awayPoints,
      fgm: g.awayFieldGoals,
      fga: g.awayFieldGoalAtt,
      fg3m: g.awayThreePointers,
      fg3a: g.awayThreePointAtt,
      ftm: g.awayFreeThrows,
      fta: g.awayFreeThrowAtt,
      oreb: g.awayReboundsOff,
      dreb: g.awayReboundsDef,
      tov: g.awayTurnovers,
    },
  }
}

export async function loadLeagueContext(season: string): Promise<LeagueContext> {
  const rows = await prisma.gameBoxScore.findMany({
    where: { season, isPlayoff: false },
    orderBy: { gameDate: 'asc' },
  })
  const records = rows.map(toGameRecord)
  const seasonProfiles = buildTeamProfiles(records)
  const last10 = buildTeamProfiles(records, { lastN: 10 })
  const lastUpdated = rows.reduce<Date | null>((max, g) => (!max || g.updatedAt > max ? g.updatedAt : max), null)
  return {
    records,
    season: seasonProfiles,
    last10,
    seasonRanks: rankProfiles(seasonProfiles.values()),
    last10Ranks: rankProfiles(last10.values()),
    baseline: leagueBaseline(seasonProfiles.values()),
    lastUpdated,
  }
}

export function leagueView(ctx: LeagueContext): LeagueView | null {
  return ctx.baseline ? { teams: ctx.baseline.teams, offRtg: ctx.baseline.offRtg, pace: ctx.baseline.pace } : null
}

function profileView(profile: TeamProfile | undefined, ranks: TeamRanks | undefined): TeamProfileView | null {
  if (!profile || !ranks) return null
  const metrics = {} as TeamProfileView['metrics']
  for (const m of RANKED_METRICS) metrics[m] = { value: profile[m], rank: ranks[m] }
  return { games: profile.games, wins: profile.wins, losses: profile.losses, metrics }
}

// ── Standings ────────────────────────────────────────────────────────────────

export async function loadStandings(season: string): Promise<Map<string, StandingView>> {
  const rows = await prisma.standing.findMany({ where: { season }, orderBy: { asOfDate: 'desc' } })
  const out = new Map<string, StandingView>()
  const rec = (w: number | null, l: number | null) => (w != null && l != null ? `${w}-${l}` : null)
  for (const s of rows) {
    if (out.has(s.teamId)) continue // newest snapshot first
    out.set(s.teamId, {
      conferenceRank: s.conferenceRank,
      streak: s.streak,
      lastTen: rec(s.lastTenWins, s.lastTenLosses),
      home: rec(s.homeWins, s.homeLosses),
      away: rec(s.awayWins, s.awayLosses),
      gamesBehind: s.gamesBehind,
    })
  }
  return out
}

export function snapshotFor(
  teamId: string,
  ctx: LeagueContext,
  teams: Map<string, TeamRefLite>,
  standings: Map<string, StandingView>,
): TeamSnapshot | null {
  const team = teams.get(teamId)
  if (!team) return null
  return {
    team,
    season: profileView(ctx.season.get(teamId), ctx.seasonRanks.get(teamId)),
    last10: profileView(ctx.last10.get(teamId), ctx.last10Ranks.get(teamId)),
    standing: standings.get(teamId) ?? null,
  }
}

// ── Games ────────────────────────────────────────────────────────────────────

export function gameResultsFor(
  teamId: string,
  records: GameRecord[],
  teams: Map<string, TeamRefLite>,
  opts: { last?: number; opponentId?: string } = {},
): GameResultView[] {
  const games = records
    .filter((g) => g.home.teamId === teamId || g.away.teamId === teamId)
    .filter((g) => !opts.opponentId || g.home.teamId === opts.opponentId || g.away.teamId === opts.opponentId)
    .map((g) => {
      const isHome = g.home.teamId === teamId
      const us = isHome ? g.home : g.away
      const them = isHome ? g.away : g.home
      return {
        gameId: g.gameId,
        date: g.gameDate.toISOString(),
        opponent: teams.get(them.teamId) ?? unknownTeam(them.teamId),
        homeAway: isHome ? ('HOME' as const) : ('AWAY' as const),
        result: us.pts > them.pts ? ('W' as const) : ('L' as const),
        points: us.pts,
        oppPoints: them.pts,
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date))
  return opts.last ? games.slice(0, opts.last) : games
}

export function unknownTeam(id: string): TeamRefLite {
  return { id, abbreviation: '???', name: 'Unknown team', nickname: 'Unknown', conference: '', primaryColor: null }
}

/** Games not yet final, soonest first. A game counts as upcoming until ~4h after tip. */
export async function loadUpcoming(
  season: string,
  teams: Map<string, TeamRefLite>,
  opts: { teamId: string; opponentId?: string; limit?: number },
): Promise<UpcomingGameView[]> {
  const since = new Date(Date.now() - 4 * 3600 * 1000)
  const teamFilter = { OR: [{ homeTeamId: opts.teamId }, { awayTeamId: opts.teamId }] }
  const oppFilter = opts.opponentId
    ? { OR: [{ homeTeamId: opts.opponentId }, { awayTeamId: opts.opponentId }] }
    : {}
  const rows = await prisma.scheduledGame.findMany({
    where: { season, status: { lt: 3 }, gameDateUtc: { gte: since }, AND: [teamFilter, oppFilter] },
    orderBy: { gameDateUtc: 'asc' },
    take: opts.limit ?? 5,
  })
  return rows.map((g) => {
    const isHome = g.homeTeamId === opts.teamId
    const oppId = isHome ? g.awayTeamId : g.homeTeamId
    return {
      gameId: g.gameId,
      dateUtc: g.gameDateUtc.toISOString(),
      statusText: g.statusText,
      opponent: teams.get(oppId) ?? unknownTeam(oppId),
      homeAway: isHome ? 'HOME' : 'AWAY',
      arena: g.arena,
      nationalTv: g.nationalTv,
    }
  })
}

export async function hasSchedule(season: string): Promise<boolean> {
  return (await prisma.scheduledGame.count({ where: { season } })) > 0
}

// ── Injuries ─────────────────────────────────────────────────────────────────

export async function loadInjuries(teamIds: string[]): Promise<{ byTeam: Map<string, InjuryView[]>; fetchedAt: string | null }> {
  const rows = await prisma.playerInjury.findMany({ where: { teamId: { in: teamIds } }, orderBy: { playerName: 'asc' } })
  const byTeam = new Map<string, InjuryView[]>()
  let fetchedAt: Date | null = null
  for (const r of rows) {
    if (!byTeam.has(r.teamId)) byTeam.set(r.teamId, [])
    byTeam.get(r.teamId)!.push({
      playerId: r.playerId,
      playerName: r.playerName,
      teamId: r.teamId,
      status: r.status,
      injuryType: r.injuryType,
      detail: r.detail,
      returnDate: r.returnDate?.toISOString() ?? null,
      fetchedAt: r.fetchedAt.toISOString(),
    })
    if (!fetchedAt || r.fetchedAt > fetchedAt) fetchedAt = r.fetchedAt
  }
  if (!fetchedAt) {
    const any = await prisma.playerInjury.findFirst({ orderBy: { fetchedAt: 'desc' }, select: { fetchedAt: true } })
    fetchedAt = any?.fetchedAt ?? null
  }
  return { byTeam, fetchedAt: fetchedAt?.toISOString() ?? null }
}

export async function loadPlayerNames(ids: Iterable<string>): Promise<Map<string, string>> {
  const unique = [...new Set(ids)]
  if (!unique.length) return new Map()
  const rows = await prisma.player.findMany({ where: { id: { in: unique } }, select: { id: true, fullName: true } })
  return new Map(rows.map((p) => [p.id, p.fullName]))
}

// ── Roster ───────────────────────────────────────────────────────────────────

type SeasonStatsRow = Awaited<ReturnType<typeof prisma.playerSeasonStats.findMany>>[number]

function toLine(s: SeasonStatsRow, teams: Map<string, TeamRefLite>): PlayerLine {
  return {
    season: s.season,
    teamAbbr: teams.get(s.teamId)?.abbreviation ?? null,
    gamesPlayed: s.gamesPlayed,
    gamesStarted: s.gamesStarted,
    minutes: s.minutesPerGame,
    points: s.pointsPerGame,
    rebounds: s.reboundsPerGame,
    assists: s.assistsPerGame,
    steals: s.stealsPerGame,
    blocks: s.blocksPerGame,
    turnovers: s.turnoversPerGame,
    fgPct: s.fieldGoalPct,
    threePct: s.threePointPct,
    threeAttempts: s.threePointAttPerGame,
    ftPct: s.freeThrowPct,
    tsPct: s.trueShootingPct,
    usageRate: s.usageRate,
    plusMinus: s.plusMinusPerGame,
    netRating: s.netRating,
  }
}

function pickRow(rows: SeasonStatsRow[], preferTeamId: string): SeasonStatsRow | undefined {
  return rows.find((r) => r.teamId === preferTeamId) ?? [...rows].sort((a, b) => b.gamesPlayed - a.gamesPlayed)[0]
}

export interface RosterBundle {
  rows: RosterRow[]
  /** this season's team game logs, for rotation/lineup views */
  logs: Awaited<ReturnType<typeof prisma.playerGameLog.findMany>>
}

export async function loadRoster(
  teamId: string,
  season: string,
  teams: Map<string, TeamRefLite>,
  injuries: InjuryView[] = [],
): Promise<RosterBundle> {
  const prev = previousSeason(season)
  const players = await prisma.player.findMany({ where: { teamId, isActive: true } })
  const ids = players.map((p) => p.id)
  const [stats, logs] = await Promise.all([
    prisma.playerSeasonStats.findMany({ where: { playerId: { in: ids }, season: { in: [season, prev] } } }),
    prisma.playerGameLog.findMany({ where: { teamId, season }, orderBy: { gameDate: 'asc' } }),
  ])

  const statsBy = new Map<string, SeasonStatsRow[]>()
  for (const s of stats) {
    const key = `${s.playerId}|${s.season}`
    if (!statsBy.has(key)) statsBy.set(key, [])
    statsBy.get(key)!.push(s)
  }
  const logsBy = new Map<string, LogLine[]>()
  for (const l of logs) {
    if (!logsBy.has(l.playerId)) logsBy.set(l.playerId, [])
    logsBy.get(l.playerId)!.push({
      gameDate: l.gameDate,
      minutes: l.minutes,
      points: l.points,
      rebounds: l.reboundsTotal,
      assists: l.assists,
      fga: l.fieldGoalAtt,
      fta: l.freeThrowAtt,
      fg3m: l.threePointers,
      plusMinus: l.plusMinus,
      dnp: l.dnp,
    })
  }
  const injuryBy = new Map(injuries.filter((i) => i.playerId).map((i) => [i.playerId!, i]))
  const injuryByName = new Map(injuries.map((i) => [i.playerName.toLowerCase(), i]))

  const startYear = seasonStartYear(season)
  const rows: RosterRow[] = players.map((p) => {
    const curRows = statsBy.get(`${p.id}|${season}`) ?? []
    const prevRows = statsBy.get(`${p.id}|${prev}`) ?? []
    const cur = pickRow(curRows, teamId)
    const classification = classifyPlayer({
      focusTeamId: teamId,
      currentStartYear: startYear,
      fromYear: p.fromYear,
      priorSeasonRows: prevRows.map((r) => ({ teamId: r.teamId, gamesPlayed: r.gamesPlayed })),
    })
    const base = classification.baselineTeamId
      ? prevRows.find((r) => r.teamId === classification.baselineTeamId)
      : undefined
    const playerLogs = logsBy.get(p.id) ?? []
    const last5 = summarizeForm(playerLogs, 5)
    const seasonForm = summarizeForm(playerLogs)
    const gp = cur?.gamesPlayed ?? seasonForm.games
    return {
      player: { id: p.id, fullName: p.fullName, position: p.position, jersey: p.jersey, headshotUrl: p.headshotUrl },
      status: classification.status,
      current: cur ? toLine(cur, teams) : null,
      baseline: base ? toLine(base, teams) : null,
      last5,
      pointsTrend: trendOf(last5.points, cur?.pointsPerGame ?? seasonForm.points),
      smallSample: gp < SMALL_SAMPLE_GAMES,
      injury: injuryBy.get(p.id) ?? injuryByName.get(p.fullName.toLowerCase()) ?? null,
    }
  })

  const role = (r: RosterRow) => roleMinutes(r.current, r.baseline, SMALL_SAMPLE_GAMES)
  rows.sort((a, b) => role(b) - role(a) || a.player.fullName.localeCompare(b.player.fullName))
  return { rows, logs }
}
