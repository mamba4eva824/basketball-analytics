import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { successResponse, badRequest, notFound, errorResponse, serverError } from '@/app/api/_lib/response'
import { parseSearchParams } from '@/app/api/_lib/validation'
import { loadLeagueContext } from '@/app/api/_lib/dashboardData'
import { LiveFeedError, fetchBoxScore, fetchPlayByPlay } from '@/app/api/_lib/nbaLive'
import { readReport } from '@/app/api/_lib/reports'
import { CURRENT_SEASON, FOCUS_TEAM_ABBR, FOCUS_TEAM_ID, leagueDate, seasonForDate } from '@/lib/constants'
import { elapsedSeconds, parseClock } from '@/lib/analytics/live'
import { buildCheckpointReports, type SeasonFactors } from '@/lib/analytics/ingameReport'
import { reportKeys } from '@/lib/reportNames'
import type { TeamProfile } from '@/lib/analytics/teamProfiles'
import type { LiveReportsResponse } from '@/lib/dashboard-types'

const querySchema = z.object({
  game: z.string().regex(/^\d{10}$/, 'Game ID must be a 10-digit NBA game ID'),
})

/** Season four factors change once a day; don't re-read every game of the season on each poll. */
const BASELINE_TTL_MS = 10 * 60_000
const baselineCache = new Map<string, { at: number; profiles: Map<string, TeamProfile> }>()

/**
 * Season profiles from games before the game's (ET) date, so a game never compares with itself and
 * a replayed game gets the baseline as it stood that day. Stored game dates are ET days at 00:00 UTC.
 */
async function seasonProfiles(season: string, dateEt: string): Promise<Map<string, TeamProfile> | null> {
  const key = `${season}:${dateEt}`
  const hit = baselineCache.get(key)
  if (hit && Date.now() - hit.at < BASELINE_TTL_MS) return hit.profiles
  try {
    const ctx = await loadLeagueContext(season, { before: new Date(`${dateEt}T00:00:00Z`) })
    if (baselineCache.size >= 20) baselineCache.clear() // a handful of game dates at most
    baselineCache.set(key, { at: Date.now(), profiles: ctx.season })
    return ctx.season
  } catch (e) {
    console.warn('In-game reports: season baseline unavailable', (e as Error).message)
    return null
  }
}

function factors(p: TeamProfile | undefined): SeasonFactors | null {
  if (!p) return null
  return {
    efgPct: p.efgPct, tovPct: p.tovPct, orebPct: p.orebPct, ftRate: p.ftRate,
    oppEfgPct: p.oppEfgPct, oppTovPct: p.oppTovPct, oppOrebPct: p.oppOrebPct, oppFtRate: p.oppFtRate,
  }
}

async function pregameReport(dateEt: string, away: string, home: string): Promise<LiveReportsResponse['pregame']> {
  const report = await readReport(`${dateEt}-${away}-at-${home}`, FOCUS_TEAM_ABBR)
  if (!report) return null
  return { slug: report.meta.slug, title: report.meta.title, keys: reportKeys(report.markdown) }
}

export async function GET(request: NextRequest) {
  const parsed = parseSearchParams(request.nextUrl.searchParams, querySchema)
  if (!parsed.success) return badRequest(parsed.error)
  const gameId = parsed.data.game

  try {
    const box = await fetchBoxScore(gameId)
    if (!box || box.gameStatus < 2) return notFound(`No live box score for game ${gameId} yet`)
    const focusIsHome = String(box.homeTeam.teamId) === FOCUS_TEAM_ID
    if (!focusIsHome && String(box.awayTeam.teamId) !== FOCUS_TEAM_ID) return badRequest(`Game ${gameId} does not involve the focus team`)
    const focus = focusIsHome ? box.homeTeam : box.awayTeam
    const opp = focusIsHome ? box.awayTeam : box.homeTeam
    const regulation = box.regulationPeriods || 4
    const elapsedNow = box.gameStatus === 3
      ? elapsedSeconds(Math.max(box.period, regulation), 0, regulation)
      : elapsedSeconds(Math.max(box.period, 1), parseClock(box.gameClock) ?? 0, regulation)

    const parsedTip = new Date(box.gameTimeUTC)
    const tipoff = Number.isNaN(parsedTip.getTime()) ? new Date() : parsedTip
    const season = Number.isNaN(parsedTip.getTime()) ? CURRENT_SEASON : seasonForDate(tipoff)
    const dateEt = leagueDate(tipoff)
    const [actions, profiles, pregame] = await Promise.all([
      fetchPlayByPlay(gameId),
      seasonProfiles(season, dateEt),
      pregameReport(dateEt, box.awayTeam.teamTricode, box.homeTeam.teamTricode),
    ])

    const names = new Map<string, string>()
    for (const t of [box.homeTeam, box.awayTeam]) for (const p of t.players) names.set(String(p.personId), p.name)
    const focusProfile = profiles?.get(String(focus.teamId))
    const oppProfile = profiles?.get(String(opp.teamId))
    const { reports, next } = buildCheckpointReports(actions, box.period, {
      focus: { tricode: focus.teamTricode, isHome: focusIsHome },
      opp: { tricode: opp.teamTricode },
      regulation,
      elapsedNow,
      names,
      season: { focus: factors(focusProfile), opp: factors(oppProfile) },
    })

    const body: LiveReportsResponse = {
      gameId,
      status: box.gameStatus,
      focusTricode: focus.teamTricode,
      oppTricode: opp.teamTricode,
      reports,
      next: box.gameStatus === 2 ? next : null,
      baseline: { season, focusGames: focusProfile?.games ?? null, oppGames: oppProfile?.games ?? null },
      pregame,
    }
    return successResponse(body)
  } catch (e) {
    if (e instanceof LiveFeedError) return errorResponse('UPSTREAM_UNAVAILABLE', e.message, 502)
    console.error('GET /api/live/reports failed', e)
    return serverError()
  }
}
