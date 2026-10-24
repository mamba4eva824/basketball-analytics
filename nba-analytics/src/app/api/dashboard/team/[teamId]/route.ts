import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/app/api/_lib/prisma'
import { successResponse, notFound, badRequest, serverError } from '@/app/api/_lib/response'
import { parseSearchParams, seasonSchema } from '@/app/api/_lib/validation'
import {
  gameResultsFor,
  getSeasonInfo,
  hasSchedule,
  leagueView,
  loadInjuries,
  loadLeagueContext,
  loadPlayerNames,
  loadRoster,
  loadStandings,
  loadTeamRefs,
  loadUpcoming,
  snapshotFor,
} from '@/app/api/_lib/dashboardData'
import { CURRENT_SEASON } from '@/lib/constants'
import { startingLineups } from '@/lib/analytics/lineups'
import { newcomerMinutesShare } from '@/lib/analytics/roster'
import { gameRatings } from '@/lib/analytics/trend'
import type { RotationView, TeamDashboardData } from '@/lib/dashboard-types'

const querySchema = z.object({
  season: seasonSchema.default(CURRENT_SEASON),
})

const ROTATION_GAMES = 10

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params
    const parsed = parseSearchParams(request.nextUrl.searchParams, querySchema)
    if (!parsed.success) return badRequest(parsed.error)
    const { season } = parsed.data

    const teams = await loadTeamRefs()
    if (!teams.has(teamId)) return notFound(`Team ${teamId} not found`)

    const [seasonInfo, ctx, standings, upcoming, scheduleLoaded, injuries, lineupRows] = await Promise.all([
      getSeasonInfo(season),
      loadLeagueContext(season),
      loadStandings(season),
      loadUpcoming(season, teams, { teamId, limit: 5 }),
      hasSchedule(season),
      loadInjuries([teamId]),
      prisma.lineupStats.findMany({ where: { teamId, season }, orderBy: { totalMinutes: 'desc' }, take: 5 }),
    ])
    const roster = await loadRoster(teamId, season, teams, injuries.byTeam.get(teamId) ?? [])
    const snapshot = snapshotFor(teamId, ctx, teams, standings)!
    const results = gameResultsFor(teamId, ctx.records, teams)
    const statusById = new Map(roster.rows.map((r) => [r.player.id, r.status]))

    const ratingTrend = gameRatings(ctx.records, teamId).map((g) => ({
      gameId: g.gameId,
      date: g.gameDate.toISOString(),
      opponentAbbr: teams.get(g.opponentId)?.abbreviation ?? '???',
      result: g.won ? ('W' as const) : ('L' as const),
      offRtg: g.offRtg,
      defRtg: g.defRtg,
      netRtg: g.netRtg,
      rollingNet: g.rollingNet,
    }))

    const starters = startingLineups(
      roster.logs.map((l) => ({ gameId: l.gameId, playerId: l.playerId, started: l.started })),
      results.map((g) => ({ gameId: g.gameId, gameDate: new Date(g.date), won: g.result === 'W', margin: g.points - g.oppPoints })),
    )

    // Rotation window: last N games, oldest → newest
    const rotationGames = results.slice(0, ROTATION_GAMES).reverse()
    const rotationGameIds = new Set(rotationGames.map((g) => g.gameId))
    const windowLogs = roster.logs.filter((l) => rotationGameIds.has(l.gameId))

    // One name lookup for everyone referenced by rotation, starting units and lineups
    const lineupIds = lineupRows.map((l) => [l.player1Id, l.player2Id, l.player3Id, l.player4Id, l.player5Id])
    const names = await loadPlayerNames([
      ...windowLogs.map((l) => l.playerId),
      ...starters.units.flatMap((u) => u.playerIds),
      ...lineupIds.flat(),
    ])
    const named = (id: string) => ({ id, name: names.get(id) ?? id })

    const totalMinutes = (m: (number | null)[]) => m.reduce<number>((s, v) => s + (v ?? 0), 0)
    const rotation: RotationView = {
      games: rotationGames.map((g) => ({ gameId: g.gameId, date: g.date, opponentAbbr: g.opponent.abbreviation, result: g.result })),
      players: [...new Set(windowLogs.map((l) => l.playerId))]
        .map((pid) => {
          const byGame = new Map(windowLogs.filter((l) => l.playerId === pid).map((l) => [l.gameId, l]))
          return {
            playerId: pid,
            name: names.get(pid) ?? pid,
            status: statusById.get(pid) ?? null,
            minutes: rotationGames.map((g) => {
              const l = byGame.get(g.gameId)
              return l && !l.dnp ? l.minutes : null
            }),
            started: rotationGames.map((g) => byGame.get(g.gameId)?.started ?? false),
          }
        })
        .filter((p) => totalMinutes(p.minutes) > 0)
        .sort((a, b) => totalMinutes(b.minutes) - totalMinutes(a.minutes)),
    }

    const dataNotes: string[] = []
    if (seasonInfo.isDemo) dataNotes.push('Synthetic demo data — not real NBA statistics.')
    if (results.length === 0) dataNotes.push(`No ${season} games in the database yet — run etl/refresh.py after tip-off.`)
    if (!scheduleLoaded) dataNotes.push('Schedule not loaded — run etl/refresh.py to see upcoming games.')
    if (starters.gamesMissingStarterData > 0)
      dataNotes.push(`${starters.gamesMissingStarterData} game(s) have no starter data (BoxScoreTraditionalV3 step).`)
    if (ratingTrend.length < results.length)
      dataNotes.push(`${results.length - ratingTrend.length} game(s) lack offensive-rebound data and are excluded from ratings.`)
    if (!injuries.fetchedAt) dataNotes.push('Injury report not loaded (optional ESPN source).')

    const data: TeamDashboardData = {
      season: seasonInfo,
      snapshot,
      league: leagueView(ctx),
      ratingTrend,
      roster: roster.rows,
      rosterSummary: {
        returning: roster.rows.filter((r) => r.status === 'returning').length,
        new: roster.rows.filter((r) => r.status === 'new').length,
        rookie: roster.rows.filter((r) => r.status === 'rookie').length,
        newcomerMinutesShare: newcomerMinutesShare(roster.logs, statusById),
      },
      rotation,
      startingLineups: {
        units: starters.units.slice(0, 5).map((u) => ({
          players: u.playerIds.map(named),
          games: u.games,
          wins: u.wins,
          losses: u.losses,
          avgMargin: u.avgMargin,
          lastUsed: u.lastUsed.toISOString(),
        })),
        gamesMissingStarterData: starters.gamesMissingStarterData,
      },
      topLineups: lineupRows.map((l, i) => ({
        players: lineupIds[i].map(named),
        gamesPlayed: l.gamesPlayed,
        minutes: l.totalMinutes,
        netRating: l.netRating,
        offRating: l.offRating,
        defRating: l.defRating,
      })),
      recentGames: results.slice(0, 10),
      upcoming,
      injuriesFetchedAt: injuries.fetchedAt,
      lastUpdated: ctx.lastUpdated?.toISOString() ?? null,
      dataNotes,
    }
    return successResponse(data)
  } catch (err) {
    console.error('GET /api/dashboard/team/[teamId] error:', err)
    return serverError()
  }
}
