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

/**
 * Maps user-facing metric names to the actual Prisma field names on PlayerGameLog.
 */
const METRIC_FIELD_MAP: Record<string, string> = {
  pts: 'points',
  points: 'points',
  fg_pct: 'fieldGoalPct',
  three_pct: 'threePointPct',
  ft_pct: 'freeThrowPct',
  rebounds: 'reboundsTotal',
  reb: 'reboundsTotal',
  assists: 'assists',
  ast: 'assists',
  steals: 'steals',
  stl: 'steals',
  blocks: 'blocks',
  blk: 'blocks',
  turnovers: 'turnovers',
  tov: 'turnovers',
  plus_minus: 'plusMinus',
  minutes: 'minutes',
  ts_pct: 'trueShootingPct',
  efg_pct: 'effectiveFgPct',
  usg: 'usageRate',
  off_rtg: 'offRating',
  def_rtg: 'defRating',
  net_rtg: 'netRating',
}

const querySchema = z.object({
  metric: z.string().refine(
    (m: string) => m in METRIC_FIELD_MAP,
    `Unknown metric. Valid values: ${Object.keys(METRIC_FIELD_MAP).join(', ')}`,
  ),
  window: z.coerce.number().int().min(2).max(82).default(10),
  season: seasonSchema.optional(),
})

interface GameRow {
  gameDate: Date
  gameId: string
  [key: string]: unknown
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> },
) {
  try {
    const { playerId } = await params
    const parsed = parseSearchParams(request.nextUrl.searchParams, querySchema)
    if (!parsed.success) return badRequest(parsed.error)
    const { metric, window, season } = parsed.data

    // Verify player exists
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true, fullName: true },
    })
    if (!player) return notFound(`Player ${playerId} not found`)

    const field = METRIC_FIELD_MAP[metric]

    const where: Record<string, unknown> = { playerId, dnp: false }
    if (season) where.season = season

    // Get all games ordered by date
    const games: GameRow[] = await prisma.playerGameLog.findMany({
      where,
      orderBy: { gameDate: 'asc' },
      select: {
        gameDate: true,
        gameId: true,
        [field]: true,
      },
    }) as unknown as GameRow[]

    // Compute rolling average
    const trend = games.map((game: GameRow, idx: number) => {
      const value = game[field] as number | null
      // Take up to `window` games ending at current index
      const windowStart = Math.max(0, idx - window + 1)
      const windowSlice = games.slice(windowStart, idx + 1)
      const windowValues: number[] = []
      for (const g of windowSlice) {
        const v = g[field] as number | null
        if (v !== null && v !== undefined) windowValues.push(v)
      }
      const rollingAvg =
        windowValues.length > 0
          ? windowValues.reduce((sum: number, v: number) => sum + v, 0) / windowValues.length
          : null

      return {
        gameDate: game.gameDate,
        gameId: game.gameId,
        value,
        rollingAvg,
      }
    })

    return successResponse({
      player,
      metric,
      field,
      window,
      season: season ?? 'all',
      dataPoints: trend.length,
      trend,
    })
  } catch (err) {
    console.error('GET /api/players/[playerId]/trends error:', err)
    return serverError()
  }
}
