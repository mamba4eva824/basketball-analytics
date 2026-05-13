import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/app/api/_lib/prisma'
import {
  successResponse,
  notFound,
  badRequest,
  serverError,
} from '@/app/api/_lib/response'
import { parseSearchParams, seasonSchema } from '@/app/api/_lib/validation'

const querySchema = z.object({
  season: seasonSchema,
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params
    const parsed = parseSearchParams(request.nextUrl.searchParams, querySchema)
    if (!parsed.success) return badRequest(parsed.error)
    const { season } = parsed.data

    // Verify team exists
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, abbreviation: true, name: true },
    })
    if (!team) return notFound(`Team ${teamId} not found`)

    const stats = await prisma.teamSeasonStats.findUnique({
      where: { teamId_season: { teamId, season } },
    })

    if (!stats) {
      return notFound(`No stats found for team ${teamId} in season ${season}`)
    }

    return successResponse({
      team,
      season: stats.season,
      record: {
        wins: stats.wins,
        losses: stats.losses,
        winPct: stats.winPct,
        gamesPlayed: stats.gamesPlayed,
      },
      perGame: {
        pointsPerGame: stats.pointsPerGame,
        oppPointsPerGame: stats.oppPointsPerGame,
        fieldGoalPct: stats.fieldGoalPct,
        threePointPct: stats.threePointPct,
        freeThrowPct: stats.freeThrowPct,
        reboundsPerGame: stats.reboundsPerGame,
        assistsPerGame: stats.assistsPerGame,
        stealsPerGame: stats.stealsPerGame,
        blocksPerGame: stats.blocksPerGame,
        turnoversPerGame: stats.turnoversPerGame,
      },
      advanced: {
        offRtg: stats.offRating,
        defRtg: stats.defRating,
        netRtg: stats.netRating,
        pace: stats.pace,
        efgPct: stats.effectiveFgPct,
        tsPct: stats.trueShootingPct,
        tovPct: stats.turnoverPct,
        orbPct: stats.offReboundPct,
        ftRate: stats.freeThrowRate,
        oppEfgPct: stats.oppEffectiveFgPct,
        oppTovPct: stats.oppTurnoverPct,
        oppFtRate: stats.oppFreeThrowRate,
      },
      scoringBreakdown: {
        fastBreakPtsPerGame: stats.fastBreakPtsPerGame,
        ptsInPaintPerGame: stats.ptsInPaintPerGame,
        ptsOffTurnoversPerGame: stats.ptsOffTurnoversPerGame,
        secondChancePtsPerGame: stats.secondChancePtsPerGame,
      },
    })
  } catch (err) {
    console.error('GET /api/teams/[teamId]/stats error:', err)
    return serverError()
  }
}
