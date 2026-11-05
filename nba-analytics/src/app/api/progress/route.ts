import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { successResponse, badRequest, notFound, serverError } from '@/app/api/_lib/response'
import { parseSearchParams, seasonSchema } from '@/app/api/_lib/validation'
import { getSeasonInfo, loadLeagueContext, loadTeamRefs } from '@/app/api/_lib/dashboardData'
import { CURRENT_SEASON, FOCUS_TEAM_ID } from '@/lib/constants'
import {
  FOCUS_DEFAULT,
  MOVER_LOOKBACK,
  RECENT_GAMES,
  SEGMENT_GAMES,
  SMALL_SAMPLE_GAMES,
  seasonProgress,
  type Segment,
} from '@/lib/analytics/seasonProgress'
import type { SeasonProgressData, SegmentView } from '@/lib/dashboard-types'

const querySchema = z.object({
  season: seasonSchema.default(CURRENT_SEASON),
})

const segmentView = ({ from, to, ...rest }: Segment): SegmentView => ({ ...rest, from: from.toISOString(), to: to.toISOString() })

/** GET /api/progress — season progress for the focus team: rank history, focus scorecard, splits, movers. */
export async function GET(request: NextRequest) {
  const parsed = parseSearchParams(request.nextUrl.searchParams, querySchema)
  if (!parsed.success) return badRequest(parsed.error)
  const { season } = parsed.data
  const teamId = FOCUS_TEAM_ID

  try {
    const [teams, seasonInfo, ctx] = await Promise.all([loadTeamRefs(), getSeasonInfo(season), loadLeagueContext(season)])
    const team = teams.get(teamId)
    if (!team) return notFound(`Team ${teamId} not found`)

    const p = seasonProgress(ctx.records, teamId)
    const dataNotes: string[] = []
    if (seasonInfo.isDemo) dataNotes.push('Synthetic demo data — not real NBA statistics.')
    if (p.games === 0) dataNotes.push(`No ${season} games in the database yet — run etl/refresh.py after tip-off.`)
    else if (p.games < SMALL_SAMPLE_GAMES) dataNotes.push(`Only ${p.games} game${p.games === 1 ? '' : 's'} so far — small sample; ranks will swing.`)

    const body: SeasonProgressData = {
      season: seasonInfo,
      team,
      games: p.games,
      rankedTeams: p.rankedTeams,
      focusDefault: FOCUS_DEFAULT,
      recentGames: RECENT_GAMES,
      segmentGames: SEGMENT_GAMES,
      moverLookback: MOVER_LOOKBACK,
      moversSince: p.moversSince,
      history: p.history.map(({ gameDate, opponentId, ...rest }) => ({
        ...rest,
        date: gameDate.toISOString(),
        opponentAbbr: teams.get(opponentId)?.abbreviation ?? '???',
      })),
      cards: p.cards,
      blocks: p.blocks.map(segmentView),
      months: p.months.map(segmentView),
      strengths: p.strengths,
      weaknesses: p.weaknesses,
      risers: p.risers,
      fallers: p.fallers,
      lastUpdated: ctx.lastUpdated?.toISOString() ?? null,
      dataNotes,
    }
    return successResponse(body)
  } catch (e) {
    console.error('GET /api/progress failed', e)
    return serverError()
  }
}
