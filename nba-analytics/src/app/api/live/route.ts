import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { successResponse, badRequest, notFound, errorResponse, serverError } from '@/app/api/_lib/response'
import { parseSearchParams } from '@/app/api/_lib/validation'
import { loadTeamRefs, loadUpcoming } from '@/app/api/_lib/dashboardData'
import { LiveFeedError, fetchBoxScore, fetchPlayByPlay, fetchScoreboard, type RawScoreboardGame } from '@/app/api/_lib/nbaLive'
import { CURRENT_SEASON, FOCUS_TEAM_ID } from '@/lib/constants'
import { buildLiveGame } from '@/lib/analytics/live'
import type { LiveGameResponse, LivePregameView, UpcomingGameView } from '@/lib/dashboard-types'

const querySchema = z.object({
  game: z.string().regex(/^\d{10}$/, 'Game ID must be a 10-digit NBA game ID').optional(),
})

function involvesFocus(g: { homeTeam: { teamId: number }; awayTeam: { teamId: number } }) {
  return String(g.homeTeam.teamId) === FOCUS_TEAM_ID || String(g.awayTeam.teamId) === FOCUS_TEAM_ID
}

function pregameView(g: RawScoreboardGame): LivePregameView {
  const isHome = String(g.homeTeam.teamId) === FOCUS_TEAM_ID
  const side = (t: RawScoreboardGame['homeTeam']) => ({
    teamId: String(t.teamId), tricode: t.teamTricode, city: t.teamCity, name: t.teamName, wins: t.wins, losses: t.losses,
  })
  return {
    gameId: g.gameId,
    tipoffUtc: g.gameTimeUTC,
    statusText: g.gameStatusText.trim(),
    isHome,
    focus: side(isHome ? g.homeTeam : g.awayTeam),
    opponent: side(isHome ? g.awayTeam : g.homeTeam),
  }
}

async function nextScheduled(): Promise<UpcomingGameView | null> {
  try {
    const teams = await loadTeamRefs()
    const [next] = await loadUpcoming(CURRENT_SEASON, teams, { teamId: FOCUS_TEAM_ID, limit: 1 })
    return next ?? null
  } catch {
    return null
  }
}

async function liveResponse(gameId: string): Promise<Response | null> {
  const box = await fetchBoxScore(gameId)
  if (!box || box.gameStatus < 2) return null
  if (!involvesFocus(box)) return badRequest(`Game ${gameId} does not involve the focus team`)
  const actions = await fetchPlayByPlay(gameId)
  const body: LiveGameResponse = { kind: 'live', game: buildLiveGame(box, actions, FOCUS_TEAM_ID, new Date()) }
  return successResponse(body)
}

export async function GET(request: NextRequest) {
  const parsed = parseSearchParams(request.nextUrl.searchParams, querySchema)
  if (!parsed.success) return badRequest(parsed.error)

  try {
    if (parsed.data.game) {
      return (await liveResponse(parsed.data.game)) ?? notFound(`No live box score for game ${parsed.data.game} yet`)
    }

    const today = (await fetchScoreboard()).find(involvesFocus)
    if (!today) {
      const body: LiveGameResponse = { kind: 'none', next: await nextScheduled() }
      return successResponse(body)
    }
    const live = await liveResponse(today.gameId)
    if (live) return live
    const body: LiveGameResponse = { kind: 'pregame', pregame: pregameView(today) }
    return successResponse(body)
  } catch (e) {
    if (e instanceof LiveFeedError) return errorResponse('UPSTREAM_UNAVAILABLE', e.message, 502)
    console.error('GET /api/live failed', e)
    return serverError()
  }
}
