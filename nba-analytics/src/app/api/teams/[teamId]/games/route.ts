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
  paginationSchema,
  dateSchema,
} from '@/app/api/_lib/validation'

const querySchema = z
  .object({
    season: seasonSchema,
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    result: z.enum(['W', 'L']).optional(),
    isPlayoff: z.enum(['true', 'false']).optional(),
  })
  .merge(paginationSchema)

interface TeamInfo {
  id: string
  abbreviation: string
  name: string
  logoUrl: string | null
}

interface GameRow {
  gameId: string
  gameDate: Date
  isPlayoff: boolean
  homeTeamId: string
  awayTeamId: string
  homeTeam: TeamInfo
  awayTeam: TeamInfo
  homePoints: number
  awayPoints: number
  homeFieldGoals: number
  homeFieldGoalAtt: number
  homeFieldGoalPct: number | null
  homeThreePointers: number
  homeThreePointAtt: number
  homeThreePointPct: number | null
  homeFreeThrows: number
  homeFreeThrowAtt: number
  homeFreeThrowPct: number | null
  homeReboundsTotal: number
  homeAssists: number
  homeSteals: number
  homeBlocks: number
  homeTurnovers: number
  awayFieldGoals: number
  awayFieldGoalAtt: number
  awayFieldGoalPct: number | null
  awayThreePointers: number
  awayThreePointAtt: number
  awayThreePointPct: number | null
  awayFreeThrows: number
  awayFreeThrowAtt: number
  awayFreeThrowPct: number | null
  awayReboundsTotal: number
  awayAssists: number
  awaySteals: number
  awayBlocks: number
  awayTurnovers: number
  arena: string | null
  attendance: number | null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params
    const parsed = parseSearchParams(request.nextUrl.searchParams, querySchema)
    if (!parsed.success) return badRequest(parsed.error)
    const { season, startDate, endDate, result, isPlayoff, page, pageSize } =
      parsed.data

    // Verify team exists
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, abbreviation: true, name: true },
    })
    if (!team) return notFound(`Team ${teamId} not found`)

    // Build where clause — games where team was home or away
    const dateFilter: Record<string, unknown> = {}
    if (startDate) dateFilter.gte = new Date(startDate)
    if (endDate) dateFilter.lte = new Date(endDate)

    const baseWhere: Record<string, unknown> = {
      season,
      ...(Object.keys(dateFilter).length > 0 ? { gameDate: dateFilter } : {}),
      ...(isPlayoff !== undefined ? { isPlayoff: isPlayoff === 'true' } : {}),
    }

    const where = {
      ...baseWhere,
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    }

    const [total, rawGames] = await Promise.all([
      prisma.gameBoxScore.count({ where }),
      prisma.gameBoxScore.findMany({
        where,
        orderBy: { gameDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          homeTeam: {
            select: { id: true, abbreviation: true, name: true, logoUrl: true },
          },
          awayTeam: {
            select: { id: true, abbreviation: true, name: true, logoUrl: true },
          },
        },
      }),
    ])

    const games = rawGames as unknown as GameRow[]

    // Enrich each game with the team's perspective
    const enriched = games.map((g: GameRow) => {
      const isHome = g.homeTeamId === teamId
      const teamPoints = isHome ? g.homePoints : g.awayPoints
      const oppPoints = isHome ? g.awayPoints : g.homePoints
      const gameResult = teamPoints > oppPoints ? 'W' : 'L'

      return {
        gameId: g.gameId,
        gameDate: g.gameDate,
        isPlayoff: g.isPlayoff,
        homeAway: isHome ? 'HOME' : 'AWAY',
        result: gameResult,
        opponent: isHome ? g.awayTeam : g.homeTeam,
        teamPoints,
        oppPoints,
        arena: g.arena,
        attendance: g.attendance,
        teamStats: {
          fieldGoals: isHome ? g.homeFieldGoals : g.awayFieldGoals,
          fieldGoalAtt: isHome ? g.homeFieldGoalAtt : g.awayFieldGoalAtt,
          fieldGoalPct: isHome ? g.homeFieldGoalPct : g.awayFieldGoalPct,
          threePointers: isHome ? g.homeThreePointers : g.awayThreePointers,
          threePointAtt: isHome ? g.homeThreePointAtt : g.awayThreePointAtt,
          threePointPct: isHome ? g.homeThreePointPct : g.awayThreePointPct,
          freeThrows: isHome ? g.homeFreeThrows : g.awayFreeThrows,
          freeThrowAtt: isHome ? g.homeFreeThrowAtt : g.awayFreeThrowAtt,
          freeThrowPct: isHome ? g.homeFreeThrowPct : g.awayFreeThrowPct,
          reboundsTotal: isHome ? g.homeReboundsTotal : g.awayReboundsTotal,
          assists: isHome ? g.homeAssists : g.awayAssists,
          steals: isHome ? g.homeSteals : g.awaySteals,
          blocks: isHome ? g.homeBlocks : g.awayBlocks,
          turnovers: isHome ? g.homeTurnovers : g.awayTurnovers,
        },
      }
    })

    // If result filter requested, apply post-enrichment
    const filtered = result
      ? enriched.filter((g: { result: string }) => g.result === result)
      : enriched

    return successResponse(filtered, { total, page, pageSize })
  } catch (err) {
    console.error('GET /api/teams/[teamId]/games error:', err)
    return serverError()
  }
}
