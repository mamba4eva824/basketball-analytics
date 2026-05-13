import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/app/api/_lib/prisma'
import {
  successResponse,
  badRequest,
  serverError,
} from '@/app/api/_lib/response'
import { parseSearchParams, seasonSchema, paginationSchema } from '@/app/api/_lib/validation'

/**
 * Maps user-facing stat names to Prisma field + sort direction on PlayerSeasonStats.
 * All stats sort descending (higher = better) except defRating (lower = better).
 */
const STAT_FIELD_MAP: Record<string, { field: string; dir: 'asc' | 'desc' }> = {
  pts: { field: 'pointsPerGame', dir: 'desc' },
  points: { field: 'pointsPerGame', dir: 'desc' },
  reb: { field: 'reboundsPerGame', dir: 'desc' },
  rebounds: { field: 'reboundsPerGame', dir: 'desc' },
  ast: { field: 'assistsPerGame', dir: 'desc' },
  assists: { field: 'assistsPerGame', dir: 'desc' },
  stl: { field: 'stealsPerGame', dir: 'desc' },
  steals: { field: 'stealsPerGame', dir: 'desc' },
  blk: { field: 'blocksPerGame', dir: 'desc' },
  blocks: { field: 'blocksPerGame', dir: 'desc' },
  fg_pct: { field: 'fieldGoalPct', dir: 'desc' },
  three_pct: { field: 'threePointPct', dir: 'desc' },
  ft_pct: { field: 'freeThrowPct', dir: 'desc' },
  ts_pct: { field: 'trueShootingPct', dir: 'desc' },
  efg_pct: { field: 'effectiveFgPct', dir: 'desc' },
  per: { field: 'per', dir: 'desc' },
  ws: { field: 'winShares', dir: 'desc' },
  bpm: { field: 'boxPlusMinus', dir: 'desc' },
  vorp: { field: 'vorp', dir: 'desc' },
  usg: { field: 'usageRate', dir: 'desc' },
  mpg: { field: 'minutesPerGame', dir: 'desc' },
  off_rtg: { field: 'offRating', dir: 'desc' },
  def_rtg: { field: 'defRating', dir: 'asc' },
  net_rtg: { field: 'netRating', dir: 'desc' },
}

const querySchema = z
  .object({
    stat: z.string().refine(
      (s: string) => s in STAT_FIELD_MAP,
      `Unknown stat. Valid values: ${Object.keys(STAT_FIELD_MAP).join(', ')}`,
    ),
    season: seasonSchema.optional(),
    minGames: z.coerce.number().int().min(0).default(10),
  })
  .merge(paginationSchema)

interface LeaderRow {
  player: { id: string; fullName: string; position: string | null; headshotUrl: string | null }
  team: { id: string; abbreviation: string; name: string; logoUrl: string | null }
  season: string
  gamesPlayed: number
  pointsPerGame: number | null
  reboundsPerGame: number | null
  assistsPerGame: number | null
  minutesPerGame: number | null
  [key: string]: unknown
}

export async function GET(request: NextRequest) {
  try {
    const parsed = parseSearchParams(request.nextUrl.searchParams, querySchema)
    if (!parsed.success) return badRequest(parsed.error)
    const { stat, season, minGames, page, pageSize } = parsed.data

    const { field, dir } = STAT_FIELD_MAP[stat]

    // Determine which season to use
    let seasonFilter = season
    if (!seasonFilter) {
      const current = await prisma.season.findFirst({
        where: { isCurrent: true },
        select: { id: true },
      })
      if (current) seasonFilter = current.id
    }

    const where: Record<string, unknown> = {
      gamesPlayed: { gte: minGames },
      [field]: { not: null },
    }
    if (seasonFilter) where.season = seasonFilter

    const [total, leaders] = await Promise.all([
      prisma.playerSeasonStats.count({ where }),
      prisma.playerSeasonStats.findMany({
        where,
        orderBy: { [field]: dir },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          player: {
            select: {
              id: true,
              fullName: true,
              position: true,
              headshotUrl: true,
            },
          },
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

    const data = (leaders as unknown as LeaderRow[]).map((l: LeaderRow, idx: number) => ({
      rank: (page - 1) * pageSize + idx + 1,
      player: l.player,
      team: l.team,
      season: l.season,
      gamesPlayed: l.gamesPlayed,
      statValue: l[field],
      statName: stat,
      statField: field,
      // Include key averages for context
      pointsPerGame: l.pointsPerGame,
      reboundsPerGame: l.reboundsPerGame,
      assistsPerGame: l.assistsPerGame,
      minutesPerGame: l.minutesPerGame,
    }))

    return successResponse(data, { total, page, pageSize })
  } catch (err) {
    console.error('GET /api/league/leaders error:', err)
    return serverError()
  }
}
