import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/app/api/_lib/prisma'
import { successResponse, badRequest, serverError } from '@/app/api/_lib/response'
import { parseSearchParams, paginationSchema } from '@/app/api/_lib/validation'

const querySchema = z
  .object({
    teamId: z.string().optional(),
    search: z.string().optional(),
    position: z.string().optional(),
    isActive: z.enum(['true', 'false']).optional(),
  })
  .merge(paginationSchema)

export async function GET(request: NextRequest) {
  try {
    const parsed = parseSearchParams(request.nextUrl.searchParams, querySchema)
    if (!parsed.success) return badRequest(parsed.error)
    const { teamId, search, position, isActive, page, pageSize } = parsed.data

    const where: Record<string, unknown> = {}

    if (teamId) where.teamId = teamId
    if (position) where.position = { contains: position, mode: 'insensitive' }
    if (isActive !== undefined) where.isActive = isActive === 'true'

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [total, players] = await Promise.all([
      prisma.player.count({ where }),
      prisma.player.findMany({
        where,
        orderBy: { lastName: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          fullName: true,
          position: true,
          jersey: true,
          height: true,
          weight: true,
          isActive: true,
          headshotUrl: true,
          teamId: true,
          team: {
            select: {
              id: true,
              abbreviation: true,
              name: true,
              logoUrl: true,
            },
          },
        },
      }),
    ])

    return successResponse(players, { total, page, pageSize })
  } catch (err) {
    console.error('GET /api/players error:', err)
    return serverError()
  }
}
