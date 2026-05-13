import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/app/api/_lib/prisma'
import {
  successResponse,
  notFound,
  badRequest,
  serverError,
} from '@/app/api/_lib/response'
import {
  parseSearchParams,
  seasonSchema,
  dateSchema,
  paginationSchema,
} from '@/app/api/_lib/validation'

const querySchema = z
  .object({
    season: seasonSchema.optional(),
    last: z.coerce.number().int().min(1).max(82).optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
  })
  .merge(paginationSchema)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> },
) {
  try {
    const { playerId } = await params
    const parsed = parseSearchParams(request.nextUrl.searchParams, querySchema)
    if (!parsed.success) return badRequest(parsed.error)
    const { season, last, startDate, endDate, page, pageSize } = parsed.data

    // Verify player exists
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true, fullName: true },
    })
    if (!player) return notFound(`Player ${playerId} not found`)

    // Build where
    const where: Record<string, unknown> = { playerId }
    if (season) where.season = season

    const dateFilter: Record<string, unknown> = {}
    if (startDate) dateFilter.gte = new Date(startDate)
    if (endDate) dateFilter.lte = new Date(endDate)
    if (Object.keys(dateFilter).length > 0) where.gameDate = dateFilter

    // If "last" is specified, override pagination to just get the last N games
    if (last) {
      const games = await prisma.playerGameLog.findMany({
        where,
        orderBy: { gameDate: 'desc' },
        take: last,
        include: {
          team: {
            select: { id: true, abbreviation: true },
          },
        },
      })

      return successResponse(games, {
        total: games.length,
        page: 1,
        pageSize: games.length,
      })
    }

    // Standard paginated query
    const [total, games] = await Promise.all([
      prisma.playerGameLog.count({ where }),
      prisma.playerGameLog.findMany({
        where,
        orderBy: { gameDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          team: {
            select: { id: true, abbreviation: true },
          },
        },
      }),
    ])

    return successResponse(games, { total, page, pageSize })
  } catch (err) {
    console.error('GET /api/players/[playerId]/gamelog error:', err)
    return serverError()
  }
}
