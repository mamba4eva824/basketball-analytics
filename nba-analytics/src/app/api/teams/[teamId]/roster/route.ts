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
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params
    const parsed = parseSearchParams(request.nextUrl.searchParams, querySchema)
    if (!parsed.success) return badRequest(parsed.error)
    const { season } = parsed.data

    // Verify team exists
    const team = await prisma.team.findUnique({ where: { id: teamId } })
    if (!team) return notFound(`Team ${teamId} not found`)

    // If season provided, get players who played for the team that season
    // via PlayerSeasonStats; otherwise get current roster via Player.teamId
    if (season) {
      const seasonStats = await prisma.playerSeasonStats.findMany({
        where: { teamId, season },
        include: {
          player: {
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
              country: true,
            },
          },
        },
        orderBy: { pointsPerGame: 'desc' },
      })

      interface SeasonStatRow {
        player: Record<string, unknown>
        gamesPlayed: number
        gamesStarted: number
        minutesPerGame: number | null
        pointsPerGame: number | null
        reboundsPerGame: number | null
        assistsPerGame: number | null
        plusMinusPerGame: number | null
      }

      const roster = (seasonStats as unknown as SeasonStatRow[]).map((s: SeasonStatRow) => ({
        ...s.player,
        seasonStats: {
          gamesPlayed: s.gamesPlayed,
          gamesStarted: s.gamesStarted,
          minutesPerGame: s.minutesPerGame,
          pointsPerGame: s.pointsPerGame,
          reboundsPerGame: s.reboundsPerGame,
          assistsPerGame: s.assistsPerGame,
          plusMinusPerGame: s.plusMinusPerGame,
        },
      }))

      return successResponse(roster, {
        total: roster.length,
        page: 1,
        pageSize: roster.length,
      })
    }

    // Current roster
    const players = await prisma.player.findMany({
      where: { teamId, isActive: true },
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
        country: true,
        birthDate: true,
        draftYear: true,
        draftRound: true,
        draftPick: true,
        fromYear: true,
        toYear: true,
        school: true,
      },
      orderBy: { lastName: 'asc' },
    })

    return successResponse(players, {
      total: players.length,
      page: 1,
      pageSize: players.length,
    })
  } catch (err) {
    console.error('GET /api/teams/[teamId]/roster error:', err)
    return serverError()
  }
}
