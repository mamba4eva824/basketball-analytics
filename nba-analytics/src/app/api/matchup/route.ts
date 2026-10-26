import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/app/api/_lib/prisma'
import { successResponse, notFound, badRequest, serverError } from '@/app/api/_lib/response'
import { dateSchema, parseSearchParams, seasonSchema } from '@/app/api/_lib/validation'
import {
  gameResultsFor,
  getSeasonInfo,
  hasSchedule,
  leagueView,
  loadInjuries,
  loadGameOn,
  loadLeagueContext,
  loadRoster,
  loadStandings,
  loadTeamRefs,
  loadUpcoming,
  snapshotFor,
  toGameRecord,
  type LeagueContext,
} from '@/app/api/_lib/dashboardData'
import { CURRENT_SEASON, FOCUS_TEAM_ID, previousSeason } from '@/lib/constants'
import { projectGame } from '@/lib/analytics/projection'
import { fourFactorEdges } from '@/lib/analytics/matchup'
import type { GameResultView, InjuryView, KeyPlayerView, MatchupData, ProjectionView, RosterRow } from '@/lib/dashboard-types'

const teamIdSchema = z.string().regex(/^\d{10}$/, 'Team ID must be a 10-digit NBA team ID')

const querySchema = z.object({
  season: seasonSchema.default(CURRENT_SEASON),
  team: teamIdSchema.default(FOCUS_TEAM_ID),
  opponent: teamIdSchema.optional(),
  /** "YYYY-MM-DD" (ET game date): the matchup as it stood before that day's games — for backfilled pre-game reports */
  asOf: dateSchema.optional(),
})

const KEY_PLAYERS = 8

function keyPlayers(rows: RosterRow[], teamId: string): KeyPlayerView[] {
  return rows.slice(0, KEY_PLAYERS).map((r) => ({ ...r, teamId }))
}

function projectionView(ctx: LeagueContext, usId: string, themId: string, usHome: boolean | null): ProjectionView | null {
  const us = ctx.season.get(usId)
  const them = ctx.season.get(themId)
  if (!us || !them || !ctx.baseline) return null
  const neutral = usHome == null
  const p = usHome === false ? projectGame(them, us, ctx.baseline) : projectGame(us, them, ctx.baseline, { neutral })
  if (!p) return null
  const ourSide = p.home.teamId === usId ? p.home : p.away
  const theirSide = p.home.teamId === usId ? p.away : p.home
  return {
    ourPoints: ourSide.points,
    theirPoints: theirSide.points,
    ourWinProb: p.home.teamId === usId ? p.homeWinProb : 1 - p.homeWinProb,
    pace: p.pace,
    smallSample: p.smallSample,
    neutral: p.neutral,
  }
}

export async function GET(request: NextRequest) {
  try {
    const parsed = parseSearchParams(request.nextUrl.searchParams, querySchema)
    if (!parsed.success) return badRequest(parsed.error)
    const { season, team: usId, asOf } = parsed.data
    // Stored game dates are ET calendar days at 00:00 UTC, so "< asOf" = every game before that day
    const before = asOf ? new Date(`${asOf}T00:00:00Z`) : undefined

    const teams = await loadTeamRefs()
    if (!teams.has(usId)) return notFound(`Team ${usId} not found`)
    if (parsed.data.opponent && !teams.has(parsed.data.opponent)) return notFound(`Team ${parsed.data.opponent} not found`)
    if (parsed.data.opponent === usId) return badRequest('opponent must differ from team')

    const [seasonInfo, ctx, standings, ourUpcoming, scheduleLoaded, gameOnDate] = await Promise.all([
      getSeasonInfo(season),
      loadLeagueContext(season, { before }),
      loadStandings(season, { before }),
      loadUpcoming(season, teams, { teamId: usId, limit: 82 }),
      hasSchedule(season),
      asOf ? loadGameOn(season, teams, { teamId: usId, dateEt: asOf, opponentId: parsed.data.opponent }) : Promise.resolve(null),
    ])

    // Opponent: explicit → that day's game (asOf) → next scheduled game → most recent game → first other team
    const ourResults = gameResultsFor(usId, ctx.records, teams)
    let opponentSource: MatchupData['opponentSource'] = 'fallback'
    let themId = parsed.data.opponent
    if (themId) opponentSource = 'query'
    else if (gameOnDate) {
      themId = gameOnDate.opponent.id
      opponentSource = 'next-game'
    } else if (ourUpcoming[0]) {
      themId = ourUpcoming[0].opponent.id
      opponentSource = 'next-game'
    } else if (ourResults[0]) {
      themId = ourResults[0].opponent.id
      opponentSource = 'last-game'
    } else {
      themId = [...teams.keys()].find((id) => id !== usId)!
    }

    const game = asOf ? gameOnDate : (ourUpcoming.find((g) => g.opponent.id === themId) ?? null)
    // The injury report is a single current snapshot: it can't describe a past date, so leave it out
    const injuries = asOf ? { byTeam: new Map<string, InjuryView[]>(), fetchedAt: null } : await loadInjuries([usId, themId])
    const [ourRoster, theirRoster] = await Promise.all([
      loadRoster(usId, season, teams, injuries.byTeam.get(usId) ?? [], { before }),
      loadRoster(themId, season, teams, injuries.byTeam.get(themId) ?? [], { before }),
    ])

    // Head-to-head (regular season, like the rest of the page): this season + last season
    const prevH2H = await prisma.gameBoxScore.findMany({
      where: {
        season: previousSeason(season),
        isPlayoff: false,
        OR: [
          { homeTeamId: usId, awayTeamId: themId },
          { homeTeamId: themId, awayTeamId: usId },
        ],
      },
    })
    const headToHead: GameResultView[] = [
      ...gameResultsFor(usId, ctx.records, teams, { opponentId: themId }),
      ...gameResultsFor(usId, prevH2H.map(toGameRecord), teams, { opponentId: themId }),
    ]

    const nextMeeting = new Map<string, string>()
    for (const g of ourUpcoming) if (!nextMeeting.has(g.opponent.id)) nextMeeting.set(g.opponent.id, g.dateUtc)
    const opponentOptions = [...teams.values()]
      .filter((t) => t.id !== usId)
      .map((t) => ({ team: t, nextMeetingUtc: nextMeeting.get(t.id) ?? null }))
      .sort((a, b) =>
        a.nextMeetingUtc && b.nextMeetingUtc
          ? a.nextMeetingUtc.localeCompare(b.nextMeetingUtc)
          : a.nextMeetingUtc
            ? -1
            : b.nextMeetingUtc
              ? 1
              : a.team.name.localeCompare(b.team.name),
      )

    const usProfile = ctx.season.get(usId)
    const themProfile = ctx.season.get(themId)
    const edges =
      usProfile && themProfile
        ? fourFactorEdges(
            { profile: usProfile, ranks: ctx.seasonRanks.get(usId)! },
            { profile: themProfile, ranks: ctx.seasonRanks.get(themId)! },
          )
        : []

    const dataNotes: string[] = []
    if (seasonInfo.isDemo) dataNotes.push('Synthetic demo data — not real NBA statistics.')
    if (!usProfile || !themProfile) dataNotes.push(`One or both teams have no ${season} games yet — ratings, edges and projection need at least one game.`)
    if (asOf) {
      dataNotes.push(
        `As of ${asOf}: only games before that day count. Rosters are today's, standings come only from snapshots taken before that day, and past injury reports aren't kept.`,
      )
      if (!game) dataNotes.push(`No game against this opponent on ${asOf} — projection assumes a neutral court.`)
    } else {
      if (!scheduleLoaded) dataNotes.push('Schedule not loaded — opponent defaults to the most recent game.')
      else if (!game) dataNotes.push('No upcoming meeting on the schedule — projection assumes a neutral court.')
      if (!injuries.fetchedAt) dataNotes.push('Injury report not loaded (optional ESPN source).')
    }

    const data: MatchupData = {
      season: seasonInfo,
      asOf: asOf ?? null,
      us: snapshotFor(usId, ctx, teams, standings)!,
      them: snapshotFor(themId, ctx, teams, standings)!,
      league: leagueView(ctx),
      game,
      opponentSource,
      opponentOptions,
      projection: projectionView(ctx, usId, themId, game ? game.homeAway === 'HOME' : null),
      edges,
      headToHead,
      keyPlayers: { ours: keyPlayers(ourRoster.rows, usId), theirs: keyPlayers(theirRoster.rows, themId) },
      recentForm: { ours: ourResults.slice(0, 10), theirs: gameResultsFor(themId, ctx.records, teams, { last: 10 }) },
      injuries: { ours: injuries.byTeam.get(usId) ?? [], theirs: injuries.byTeam.get(themId) ?? [] },
      injuriesFetchedAt: injuries.fetchedAt,
      dataNotes,
    }
    return successResponse(data)
  } catch (err) {
    console.error('GET /api/matchup error:', err)
    return serverError()
  }
}
