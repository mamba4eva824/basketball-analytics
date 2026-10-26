import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/app/api/_lib/prisma'
import { successResponse, badRequest, serverError } from '@/app/api/_lib/response'
import { parseSearchParams, seasonSchema } from '@/app/api/_lib/validation'
import { getSeasonInfo, loadTeamRefs, unknownTeam } from '@/app/api/_lib/dashboardData'
import { CURRENT_SEASON, FOCUS_TEAM_ID, leagueDate } from '@/lib/constants'
import { buildSchedule, summarizeSchedule } from '@/lib/analytics/schedule'
import type { ScheduleData, ScheduleGameView } from '@/lib/dashboard-types'

const querySchema = z.object({
  season: seasonSchema.default(CURRENT_SEASON),
})

/** A full regular season; fewer rows means some dates aren't set yet (e.g. NBA Cup knockout games). */
const REGULAR_SEASON_GAMES = 82
/** Regular-season game IDs; play-in (005), playoffs (004) and the NBA Cup final (006) don't count toward the 82. */
const REGULAR_SEASON_PREFIX = '002'

export async function GET(request: NextRequest) {
  const parsed = parseSearchParams(request.nextUrl.searchParams, querySchema)
  if (!parsed.success) return badRequest(parsed.error)
  const { season } = parsed.data

  try {
    const [seasonInfo, teams, rows] = await Promise.all([
      getSeasonInfo(season),
      loadTeamRefs(),
      prisma.scheduledGame.findMany({
        where: { season, gameId: { startsWith: REGULAR_SEASON_PREFIX }, OR: [{ homeTeamId: FOCUS_TEAM_ID }, { awayTeamId: FOCUS_TEAM_ID }] },
        orderBy: { gameDateUtc: 'asc' },
      }),
    ])
    const now = new Date()
    const entries = buildSchedule(rows, FOCUS_TEAM_ID, now)
    const byId = new Map(rows.map((r) => [r.gameId, r]))

    const games: ScheduleGameView[] = entries.map((e) => {
      const g = byId.get(e.gameId)!
      return {
        ...e,
        tipoffUtc: g.gameDateUtc.toISOString(),
        dateEt: g.gameDateEt,
        statusText: g.statusText,
        opponent: teams.get(e.opponentId) ?? unknownTeam(e.opponentId),
        arena: [g.arena, g.arenaCity].filter(Boolean).join(', ') || null,
        nationalTv: g.nationalTv,
        label: g.gameLabel,
      }
    })

    const body: ScheduleData = {
      season: seasonInfo,
      today: leagueDate(now),
      games,
      summary: summarizeSchedule(entries),
      unscheduled: Math.max(0, REGULAR_SEASON_GAMES - games.length),
    }
    return successResponse(body)
  } catch (e) {
    console.error('GET /api/schedule failed', e)
    return serverError()
  }
}
