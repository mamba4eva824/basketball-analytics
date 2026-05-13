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
  sortDirectionSchema,
} from '@/app/api/_lib/validation'

const querySchema = z
  .object({
    season: seasonSchema,
    sortBy: z
      .enum(['netRating', 'totalMinutes', 'offRating', 'defRating', 'plusMinus'])
      .default('totalMinutes'),
    sortDir: sortDirectionSchema,
    minMinutes: z.coerce.number().min(0).default(0),
  })
  .merge(paginationSchema)

interface PlayerInfo {
  id: string
  fullName: string
  position: string | null
  headshotUrl: string | null
}

interface LineupRow {
  id: string
  lineupKey: string
  player1Id: string
  player2Id: string
  player3Id: string
  player4Id: string
  player5Id: string
  gamesPlayed: number
  totalMinutes: number
  offRating: number | null
  defRating: number | null
  netRating: number | null
  pace: number | null
  points: number | null
  oppPoints: number | null
  fieldGoalPct: number | null
  threePointPct: number | null
  freeThrowPct: number | null
  rebounds: number | null
  assists: number | null
  steals: number | null
  blocks: number | null
  turnovers: number | null
  plusMinus: number | null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params
    const parsed = parseSearchParams(request.nextUrl.searchParams, querySchema)
    if (!parsed.success) return badRequest(parsed.error)
    const { season, sortBy, sortDir, minMinutes, page, pageSize } = parsed.data

    // Verify team exists
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, abbreviation: true, name: true },
    })
    if (!team) return notFound(`Team ${teamId} not found`)

    const where = {
      teamId,
      season,
      totalMinutes: { gte: minMinutes },
    }

    const [total, rawLineups] = await Promise.all([
      prisma.lineupStats.count({ where }),
      prisma.lineupStats.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    const lineups = rawLineups as unknown as LineupRow[]

    // Collect all unique player IDs from the lineups
    const playerIds = new Set<string>()
    for (const lineup of lineups) {
      playerIds.add(lineup.player1Id)
      playerIds.add(lineup.player2Id)
      playerIds.add(lineup.player3Id)
      playerIds.add(lineup.player4Id)
      playerIds.add(lineup.player5Id)
    }

    // Fetch player names for enrichment
    const players = await prisma.player.findMany({
      where: { id: { in: Array.from(playerIds) } },
      select: { id: true, fullName: true, position: true, headshotUrl: true },
    }) as unknown as PlayerInfo[]

    const playerMap = new Map<string, PlayerInfo>(
      players.map((p: PlayerInfo) => [p.id, p]),
    )

    const unknownPlayer: PlayerInfo = { id: '', fullName: 'Unknown', position: null, headshotUrl: null }

    const enriched = lineups.map((l: LineupRow) => ({
      id: l.id,
      lineupKey: l.lineupKey,
      players: [l.player1Id, l.player2Id, l.player3Id, l.player4Id, l.player5Id].map(
        (pid: string) => playerMap.get(pid) ?? { ...unknownPlayer, id: pid },
      ),
      gamesPlayed: l.gamesPlayed,
      totalMinutes: l.totalMinutes,
      offRating: l.offRating,
      defRating: l.defRating,
      netRating: l.netRating,
      pace: l.pace,
      points: l.points,
      oppPoints: l.oppPoints,
      fieldGoalPct: l.fieldGoalPct,
      threePointPct: l.threePointPct,
      freeThrowPct: l.freeThrowPct,
      rebounds: l.rebounds,
      assists: l.assists,
      steals: l.steals,
      blocks: l.blocks,
      turnovers: l.turnovers,
      plusMinus: l.plusMinus,
    }))

    return successResponse(enriched, { total, page, pageSize })
  } catch (err) {
    console.error('GET /api/teams/[teamId]/lineups error:', err)
    return serverError()
  }
}
