import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { successResponse, notFound, badRequest, serverError } from '@/app/api/_lib/response'
import { parseSearchParams, seasonSchema } from '@/app/api/_lib/validation'
import { getSeasonInfo, loadLeagueContext, loadTeamRefs } from '@/app/api/_lib/dashboardData'
import { CURRENT_SEASON } from '@/lib/constants'
import { metricTrend } from '@/lib/analytics/metricTrend'
import { RANKED_METRICS } from '@/lib/analytics/ranks'
import { ROLLING_WINDOW } from '@/lib/analytics/trend'
import type { AdvancedTeamData, MetricWithRank, RankedMetric } from '@/lib/dashboard-types'

const querySchema = z.object({
  season: seasonSchema.default(CURRENT_SEASON),
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

    const teams = await loadTeamRefs()
    const team = teams.get(teamId)
    if (!team) return notFound(`Team ${teamId} not found`)

    const [seasonInfo, ctx] = await Promise.all([getSeasonInfo(season), loadLeagueContext(season)])
    const profile = ctx.season.get(teamId)
    const ranks = ctx.seasonRanks.get(teamId)
    const seasonMetrics = {} as Record<RankedMetric, MetricWithRank>
    for (const m of RANKED_METRICS) seasonMetrics[m] = { value: profile?.[m] ?? null, rank: ranks?.[m] ?? null }

    const body: AdvancedTeamData = {
      season: seasonInfo,
      team,
      rollingWindow: ROLLING_WINDOW,
      games: metricTrend(ctx.records, teamId).map((g) => ({
        gameId: g.gameId,
        date: g.gameDate.toISOString(),
        opponentAbbr: teams.get(g.opponentId)?.abbreviation ?? '???',
        result: g.won ? 'W' : 'L',
        game: g.game,
        rolling: g.rolling,
        toDate: g.toDate,
      })),
      seasonMetrics,
      rankedTeams: ctx.seasonRanks.size,
    }
    return successResponse(body)
  } catch (e) {
    console.error('GET /api/advanced/team failed', e)
    return serverError()
  }
}
