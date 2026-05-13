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
  gameId: z.string().optional(),
  shotZone: z.string().optional(),
  shotType: z.enum(['TWO_POINTER', 'THREE_POINTER']).optional(),
  shotResult: z.enum(['MADE', 'MISSED']).optional(),
  period: z.coerce.number().int().min(1).optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> },
) {
  try {
    const { playerId } = await params
    const parsed = parseSearchParams(request.nextUrl.searchParams, querySchema)
    if (!parsed.success) return badRequest(parsed.error)
    const { season, gameId, shotZone, shotType, shotResult, period } = parsed.data

    // Verify player exists
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true, fullName: true },
    })
    if (!player) return notFound(`Player ${playerId} not found`)

    const where: Record<string, unknown> = { playerId, season }
    if (gameId) where.gameId = gameId
    if (shotZone) where.shotZone = shotZone
    if (shotType) where.shotType = shotType
    if (shotResult) where.shotResult = shotResult
    if (period) where.period = period

    const shots = await prisma.shotChart.findMany({
      where,
      orderBy: { gameId: 'asc' },
      select: {
        id: true,
        gameId: true,
        locX: true,
        locY: true,
        shotZone: true,
        shotZoneArea: true,
        shotZoneRange: true,
        shotDistance: true,
        shotType: true,
        shotResult: true,
        actionType: true,
        period: true,
        gameClock: true,
        shotValue: true,
      },
    })

    // Compute zone summary stats
    const zoneMap = new Map<
      string,
      { made: number; attempted: number; zone: string }
    >()
    for (const shot of shots) {
      const zone = shot.shotZone ?? 'Unknown'
      const entry = zoneMap.get(zone) ?? { made: 0, attempted: 0, zone }
      entry.attempted++
      if (shot.shotResult === 'MADE') entry.made++
      zoneMap.set(zone, entry)
    }
    const zoneSummary = Array.from(zoneMap.values()).map(
      (zoneEntry: { made: number; attempted: number; zone: string }) => ({
        ...zoneEntry,
        pct: zoneEntry.attempted > 0 ? zoneEntry.made / zoneEntry.attempted : 0,
      }),
    )

    const madeCount = shots.filter(
      (s: { shotResult: string }) => s.shotResult === 'MADE',
    ).length

    return successResponse({
      player,
      season,
      totalShots: shots.length,
      totalMade: madeCount,
      overallPct: shots.length > 0 ? madeCount / shots.length : 0,
      zoneSummary,
      shots,
    })
  } catch (err) {
    console.error('GET /api/players/[playerId]/shots error:', err)
    return serverError()
  }
}
