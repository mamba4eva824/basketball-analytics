import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/app/api/_lib/prisma'
import { successResponse, badRequest, serverError } from '@/app/api/_lib/response'
import { parseSearchParams, seasonSchema } from '@/app/api/_lib/validation'
import { getSeasonInfo } from '@/app/api/_lib/dashboardData'
import { CURRENT_SEASON, FOCUS_TEAM_ID } from '@/lib/constants'
import {
  MAX_COMBO_PLAYERS,
  comparisonPlan,
  comparisonRows,
  requiredKeys,
  sizeCoverage,
  validateSelection,
  type GroupTotals,
} from '@/lib/analytics/lineupCombos'
import type { LineupLabData, LineupPoolPlayer } from '@/lib/dashboard-types'

/** Comma-separated NBA player IDs, e.g. "1629029,1630559". */
const idList = z
  .string()
  .optional()
  .transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []))
  .pipe(z.array(z.string().regex(/^\d{1,10}$/, 'Player IDs must be numeric')).max(MAX_COMBO_PLAYERS))

const querySchema = z.object({
  season: seasonSchema.default(CURRENT_SEASON),
  on: idList,
  off: idList,
})

type GroupRow = Awaited<ReturnType<typeof prisma.lineupGroupStats.findMany>>[number]

/** Opponent totals only when every field is there — never fill a gap with 0 (that invents a metric). */
function oppTotals(r: GroupRow): GroupTotals['opp'] {
  const { oppPts, oppFgm, oppFga, oppFg3m, oppFg3a, oppFtm, oppFta, oppOreb, oppDreb, oppTov } = r
  if (oppPts == null || oppFgm == null || oppFga == null || oppFg3m == null || oppFg3a == null ||
      oppFtm == null || oppFta == null || oppOreb == null || oppDreb == null || oppTov == null) return null
  return { pts: oppPts, fgm: oppFgm, fga: oppFga, fg3m: oppFg3m, fg3a: oppFg3a, ftm: oppFtm, fta: oppFta, oreb: oppOreb, dreb: oppDreb, tov: oppTov }
}

function toTotals(r: GroupRow): GroupTotals {
  return {
    gamesPlayed: r.gamesPlayed,
    minutes: r.minutes,
    pts: r.pts, fgm: r.fgm, fga: r.fga, fg3m: r.fg3m, fg3a: r.fg3a, ftm: r.ftm, fta: r.fta,
    oreb: r.oreb, dreb: r.dreb, ast: r.ast, tov: r.tov, stl: r.stl, blk: r.blk, plusMinus: r.plusMinus,
    opp: oppTotals(r),
  }
}

/**
 * GET /api/lineups?on=<ids>&off=<ids> — Lineup Lab for the focus team: the player pool, and for
 * a selection (players required on the floor, optionally others required off) the selection plus
 * each player-removed comparison and the team, from NBA.com group totals.
 */
export async function GET(request: NextRequest) {
  const parsed = parseSearchParams(request.nextUrl.searchParams, querySchema)
  if (!parsed.success) return badRequest(parsed.error)
  const { season, on, off } = parsed.data
  const teamId = FOCUS_TEAM_ID

  try {
    const plan = comparisonPlan(on, off)
    const invalid = on.length || off.length ? validateSelection(on, off) : null
    const keys = invalid ? [] : [...new Set(plan.flatMap((p) => requiredKeys(p.on, p.off)))]

    const [seasonInfo, sizeRows, onCourt, groups, team] = await Promise.all([
      getSeasonInfo(season),
      prisma.lineupGroupStats.groupBy({ by: ['groupSize'], where: { teamId, season }, _max: { updatedAt: true }, _sum: { minutes: true } }),
      prisma.lineupGroupStats.findMany({ where: { teamId, season, groupSize: 1 }, orderBy: { minutes: 'desc' } }),
      keys.length ? prisma.lineupGroupStats.findMany({ where: { teamId, season, groupKey: { in: keys } } }) : Promise.resolve([] as GroupRow[]),
      prisma.team.findUnique({ where: { id: teamId }, select: { nickname: true } }),
    ])

    const players = await prisma.player.findMany({
      where: { id: { in: [...new Set([...onCourt.map((r) => r.groupKey), ...on, ...off])] } },
      select: { id: true, fullName: true, position: true, jersey: true, headshotUrl: true, teamId: true },
    })
    const byId = new Map(players.map((p) => [p.id, p]))
    const pool: LineupPoolPlayer[] = onCourt.map((r) => {
      const p = byId.get(r.groupKey)
      return {
        id: r.groupKey,
        name: p?.fullName ?? `Player ${r.groupKey}`,
        position: p?.position ?? null,
        jersey: p?.jersey ?? null,
        headshotUrl: p?.headshotUrl ?? null,
        minutes: r.minutes,
        onRoster: p?.teamId === teamId,
      }
    }).sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name))

    const sizes = new Set(sizeRows.map((r) => r.groupSize))
    const coverage = sizeCoverage(new Map(sizeRows.map((r) => [r.groupSize, r._sum.minutes ?? 0])))
    const totals = new Map(groups.map((g) => [g.groupKey, toTotals(g)]))
    const surname = (id: string) => {
      const name = byId.get(id)?.fullName
      return name ? name.split(' ').slice(1).join(' ') || name : `#${id}`
    }
    const rows = invalid ? [] : comparisonRows((k) => totals.get(k), on, off, sizes, surname, team?.nickname ?? 'Team', coverage)
    const lastUpdated = sizeRows.reduce<Date | null>((max, r) => (r._max.updatedAt && (!max || r._max.updatedAt > max) ? r._max.updatedAt : max), null)

    const body: LineupLabData = {
      season: seasonInfo,
      teamId,
      pool,
      sizes: [...sizes].sort((a, b) => a - b),
      rows,
      error: invalid,
      lastUpdated: lastUpdated?.toISOString() ?? null,
    }
    return successResponse(body)
  } catch (e) {
    console.error('GET /api/lineups failed', e)
    return serverError()
  }
}
