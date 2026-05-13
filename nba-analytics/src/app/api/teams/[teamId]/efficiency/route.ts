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
  type: z.enum(['game', 'snapshot', 'both']).default('both'),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params
    const parsed = parseSearchParams(request.nextUrl.searchParams, querySchema)
    if (!parsed.success) return badRequest(parsed.error)
    const { season, type } = parsed.data

    // Verify team exists
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, abbreviation: true, name: true },
    })
    if (!team) return notFound(`Team ${teamId} not found`)

    const data: Record<string, unknown> = { team, season }

    // Per-game efficiency data
    if (type === 'game' || type === 'both') {
      const gameEfficiency = await prisma.teamGameEfficiency.findMany({
        where: { teamId, season },
        orderBy: { gameDate: 'asc' },
        select: {
          gameId: true,
          gameDate: true,
          offRating: true,
          defRating: true,
          netRating: true,
          pace: true,
          possessions: true,
          result: true,
          homeAway: true,
        },
      })
      data.gameEfficiency = gameEfficiency
    }

    // Windowed efficiency snapshots
    if (type === 'snapshot' || type === 'both') {
      const snapshots = await prisma.teamEfficiencySnapshot.findMany({
        where: { teamId, season },
        orderBy: [{ snapshotDate: 'desc' }, { window: 'asc' }],
        select: {
          window: true,
          snapshotDate: true,
          offRating: true,
          defRating: true,
          netRating: true,
          pace: true,
          wins: true,
          losses: true,
          winPct: true,
          effectiveFgPct: true,
          turnoverPct: true,
          offReboundPct: true,
          freeThrowRate: true,
          oppEffectiveFgPct: true,
          oppTurnoverPct: true,
          oppOffReboundPct: true,
          oppFreeThrowRate: true,
        },
      })
      data.snapshots = snapshots
    }

    return successResponse(data)
  } catch (err) {
    console.error('GET /api/teams/[teamId]/efficiency error:', err)
    return serverError()
  }
}
