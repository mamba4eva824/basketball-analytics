import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/app/api/_lib/prisma'
import { successResponse, notFound, badRequest, serverError } from '@/app/api/_lib/response'
import { parseSearchParams, seasonSchema } from '@/app/api/_lib/validation'
import { getSeasonInfo, loadTeamRefs } from '@/app/api/_lib/dashboardData'
import { CURRENT_SEASON, previousSeason } from '@/lib/constants'
import { SMALL_SAMPLE_GAMES } from '@/lib/analytics/projection'
import { playerTrend, type PlayerGameInput } from '@/lib/analytics/playerTrend'
import { ROLLING_WINDOW } from '@/lib/analytics/trend'
import type { AdvancedPlayerBaseline, AdvancedPlayerLine, AdvancedPlayersData } from '@/lib/dashboard-types'

const querySchema = z.object({
  season: seasonSchema.default(CURRENT_SEASON),
})

/** Advanced Player Analytics: NBA.com season advanced lines for the roster, plus box-score trends. */
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
    const team = teams.get(teamId)
    if (!team) return notFound(`Team ${teamId} not found`)

    const [seasonInfo, roster, logs, boxes] = await Promise.all([
      getSeasonInfo(season),
      prisma.player.findMany({
        where: { teamId },
        select: {
          id: true, fullName: true, position: true, headshotUrl: true,
          // unique per (player, team, season): a traded player also has his old team's row
          playerSeasonStats: { where: { season, teamId } },
        },
      }),
      prisma.playerGameLog.findMany({
        where: { teamId, season },
        select: {
          playerId: true, gameId: true, gameDate: true, minutes: true, points: true,
          fieldGoals: true, fieldGoalAtt: true, threePointers: true, threePointAtt: true, freeThrowAtt: true,
          reboundsTotal: true, assists: true, turnovers: true, plusMinus: true,
        },
      }),
      prisma.gameBoxScore.findMany({
        where: { season, OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
        select: {
          gameId: true, homeTeamId: true, awayTeamId: true, homePoints: true, awayPoints: true,
          homeFieldGoalAtt: true, awayFieldGoalAtt: true, homeFreeThrowAtt: true, awayFreeThrowAtt: true,
          homeTurnovers: true, awayTurnovers: true,
        },
      }),
    ])

    // team side of each game: totals for usage, opponent and result for labels
    const teamMinutes = new Map<string, number>()
    for (const l of logs) teamMinutes.set(l.gameId, (teamMinutes.get(l.gameId) ?? 0) + (l.minutes ?? 0))
    const games = new Map(boxes.map((b) => {
      const home = b.homeTeamId === teamId
      return [b.gameId, {
        opponentId: home ? b.awayTeamId : b.homeTeamId,
        won: home ? b.homePoints > b.awayPoints : b.awayPoints > b.homePoints,
        team: {
          fga: home ? b.homeFieldGoalAtt : b.awayFieldGoalAtt,
          fta: home ? b.homeFreeThrowAtt : b.awayFreeThrowAtt,
          tov: home ? b.homeTurnovers : b.awayTurnovers,
          min: teamMinutes.get(b.gameId) ?? 0,
        },
      }]
    }))

    // data rule 4: small samples get last season's line (any team) as a baseline
    const prev = previousSeason(season)
    const smallIds = roster.filter((p) => (p.playerSeasonStats[0]?.gamesPlayed ?? 0) < SMALL_SAMPLE_GAMES).map((p) => p.id)
    const prevRows = smallIds.length
      ? await prisma.playerSeasonStats.findMany({
          where: { season: prev, playerId: { in: smallIds } },
          select: { playerId: true, teamId: true, gamesPlayed: true, pointsPerGame: true, usageRate: true, trueShootingPct: true, netRating: true },
        })
      : []
    const baselines = new Map<string, AdvancedPlayerBaseline>()
    for (const r of prevRows) {
      const have = baselines.get(r.playerId)
      if (have && have.gamesPlayed >= r.gamesPlayed) continue
      baselines.set(r.playerId, {
        season: prev,
        teamAbbr: teams.get(r.teamId)?.abbreviation ?? null,
        gamesPlayed: r.gamesPlayed,
        pointsPerGame: r.pointsPerGame,
        usageRate: r.usageRate,
        trueShootingPct: r.trueShootingPct,
        netRating: r.netRating,
      })
    }

    const inputs = new Map<string, PlayerGameInput[]>()
    for (const l of logs) {
      const g = games.get(l.gameId)
      if (!g) continue
      const list = inputs.get(l.playerId) ?? []
      list.push({
        gameId: l.gameId, gameDate: l.gameDate, opponentId: g.opponentId, won: g.won,
        min: l.minutes ?? 0, pts: l.points, fgm: l.fieldGoals, fga: l.fieldGoalAtt,
        fg3m: l.threePointers, fg3a: l.threePointAtt, fta: l.freeThrowAtt,
        reb: l.reboundsTotal, ast: l.assists, tov: l.turnovers, plusMinus: l.plusMinus, team: g.team,
      })
      inputs.set(l.playerId, list)
    }

    const players: AdvancedPlayerLine[] = roster
      .map((p) => {
        const s = p.playerSeasonStats[0]
        const trend = playerTrend(inputs.get(p.id) ?? [])
        return {
          playerId: p.id,
          name: p.fullName,
          position: p.position,
          headshotUrl: p.headshotUrl,
          gamesPlayed: s?.gamesPlayed ?? trend.length,
          minutesPerGame: s?.minutesPerGame ?? null,
          pointsPerGame: s?.pointsPerGame ?? null,
          usageRate: s?.usageRate ?? null,
          trueShootingPct: s?.trueShootingPct ?? null,
          effectiveFgPct: s?.effectiveFgPct ?? null,
          assistPct: s?.assistPct ?? null,
          reboundPct: s?.reboundPct ?? null,
          offRating: s?.offRating ?? null,
          defRating: s?.defRating ?? null,
          netRating: s?.netRating ?? null,
          pie: s?.per ?? null,
          plusMinusPerGame: s?.plusMinusPerGame ?? null,
          previous: baselines.get(p.id) ?? null,
          games: trend.map((g) => ({
            gameId: g.gameId,
            date: g.gameDate.toISOString(),
            opponentAbbr: teams.get(g.opponentId)?.abbreviation ?? '???',
            result: g.won ? 'W' as const : 'L' as const,
            game: g.game,
            rolling: g.rolling,
            toDate: g.toDate,
          })),
        }
      })
      .sort((a, b) => (b.minutesPerGame ?? -1) - (a.minutesPerGame ?? -1) || a.name.localeCompare(b.name))

    const body: AdvancedPlayersData = { season: seasonInfo, team, rollingWindow: ROLLING_WINDOW, players }
    return successResponse(body)
  } catch (e) {
    console.error('GET /api/advanced/players failed', e)
    return serverError()
  }
}
