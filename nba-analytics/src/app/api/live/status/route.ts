import { successResponse, errorResponse, serverError } from '@/app/api/_lib/response'
import { LiveFeedError, fetchScoreboard } from '@/app/api/_lib/nbaLive'
import { FOCUS_TEAM_ID } from '@/lib/constants'
import type { LiveStatus } from '@/lib/dashboard-types'

/** Scoreboard-only check (one cached feed call) for "is the focus team playing right now?". */
export async function GET() {
  try {
    const game = (await fetchScoreboard()).find(
      (g) => String(g.homeTeam.teamId) === FOCUS_TEAM_ID || String(g.awayTeam.teamId) === FOCUS_TEAM_ID,
    )
    const body: LiveStatus = { gameId: game?.gameId ?? null, live: game?.gameStatus === 2 }
    return successResponse(body)
  } catch (e) {
    if (e instanceof LiveFeedError) return errorResponse('UPSTREAM_UNAVAILABLE', e.message, 502)
    console.error('GET /api/live/status failed', e)
    return serverError()
  }
}
