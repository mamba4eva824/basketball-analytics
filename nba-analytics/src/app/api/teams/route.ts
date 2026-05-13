import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/app/api/_lib/prisma'
import { successResponse, badRequest, serverError } from '@/app/api/_lib/response'
import { parseSearchParams, conferenceSchema } from '@/app/api/_lib/validation'

const querySchema = z.object({
  conference: conferenceSchema.optional(),
  division: z
    .enum(['ATLANTIC', 'CENTRAL', 'SOUTHEAST', 'NORTHWEST', 'PACIFIC', 'SOUTHWEST'])
    .optional(),
  search: z.string().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const parsed = parseSearchParams(request.nextUrl.searchParams, querySchema)
    if (!parsed.success) return badRequest(parsed.error)
    const { conference, division, search } = parsed.data

    const where: Record<string, unknown> = {}

    if (conference) {
      where.conference = conference.toUpperCase()
    }
    if (division) {
      where.division = division
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { abbreviation: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { nickname: { contains: search, mode: 'insensitive' } },
      ]
    }

    const teams = await prisma.team.findMany({
      where,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        abbreviation: true,
        name: true,
        city: true,
        nickname: true,
        conference: true,
        division: true,
        logoUrl: true,
        primaryColor: true,
        secondaryColor: true,
      },
    })

    return successResponse(teams, {
      total: teams.length,
      page: 1,
      pageSize: teams.length,
    })
  } catch (err) {
    console.error('GET /api/teams error:', err)
    return serverError()
  }
}
