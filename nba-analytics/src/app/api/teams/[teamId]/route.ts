import { prisma } from '@/app/api/_lib/prisma'
import { successResponse, notFound, serverError } from '@/app/api/_lib/response'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        teamSeasonStats: {
          orderBy: { season: 'desc' },
          take: 1,
        },
        standings: {
          orderBy: { asOfDate: 'desc' },
          take: 1,
          select: {
            wins: true,
            losses: true,
            winPct: true,
            conferenceRank: true,
            divisionRank: true,
            streak: true,
            playoffSeed: true,
            clinchStatus: true,
          },
        },
      },
    })

    if (!team) return notFound(`Team ${teamId} not found`)

    return successResponse(team)
  } catch (err) {
    console.error('GET /api/teams/[teamId] error:', err)
    return serverError()
  }
}
