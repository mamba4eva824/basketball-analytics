import { prisma } from '@/app/api/_lib/prisma'
import { successResponse, notFound, serverError } from '@/app/api/_lib/response'
import { loadGamesStarted } from '@/app/api/_lib/dashboardData'
import { startKey } from '@/lib/analytics/roster'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ playerId: string }> },
) {
  try {
    const { playerId } = await params

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: {
        team: {
          select: {
            id: true,
            abbreviation: true,
            name: true,
            logoUrl: true,
            primaryColor: true,
          },
        },
        playerSeasonStats: {
          orderBy: { season: 'desc' },
          select: {
            season: true,
            teamId: true,
            gamesPlayed: true,
            minutesPerGame: true,
            pointsPerGame: true,
            reboundsPerGame: true,
            assistsPerGame: true,
            stealsPerGame: true,
            blocksPerGame: true,
            turnoversPerGame: true,
            fieldGoalPct: true,
            threePointPct: true,
            freeThrowPct: true,
            trueShootingPct: true,
            effectiveFgPct: true,
            usageRate: true,
            per: true,
            winShares: true,
            boxPlusMinus: true,
            vorp: true,
          },
        },
      },
    })

    if (!player) return notFound(`Player ${playerId} not found`)

    const starts = await loadGamesStarted([playerId], player.playerSeasonStats.map((s) => s.season))
    return successResponse({
      ...player,
      playerSeasonStats: player.playerSeasonStats.map((s) => ({
        ...s,
        gamesStarted: starts.get(startKey(playerId, s.teamId, s.season)) ?? null,
      })),
    })
  } catch (err) {
    console.error('GET /api/players/[playerId] error:', err)
    return serverError()
  }
}
