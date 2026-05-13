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
  season: seasonSchema.optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> },
) {
  try {
    const { playerId } = await params
    const parsed = parseSearchParams(request.nextUrl.searchParams, querySchema)
    if (!parsed.success) return badRequest(parsed.error)
    const { season } = parsed.data

    // Verify player exists
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: {
        id: true,
        fullName: true,
        position: true,
        headshotUrl: true,
        teamId: true,
      },
    })
    if (!player) return notFound(`Player ${playerId} not found`)

    const where: Record<string, unknown> = { playerId }
    if (season) where.season = season

    const stats = await prisma.playerSeasonStats.findMany({
      where,
      orderBy: { season: 'desc' },
      include: {
        team: {
          select: { id: true, abbreviation: true, name: true, logoUrl: true },
        },
      },
    })

    if (stats.length === 0) {
      return notFound(
        `No stats found for player ${playerId}${season ? ` in season ${season}` : ''}`,
      )
    }

    // If single season requested, return flat; otherwise return array
    return successResponse(season ? stats[0] : stats)
  } catch (err) {
    console.error('GET /api/players/[playerId]/stats error:', err)
    return serverError()
  }
}
