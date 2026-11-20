import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/app/api/_lib/prisma'
import { successResponse, badRequest, serverError } from '@/app/api/_lib/response'
import { parseSearchParams, seasonSchema } from '@/app/api/_lib/validation'
import { getSeasonInfo, loadTeamRefs, toGameRecord, unknownTeam } from '@/app/api/_lib/dashboardData'
import { toGroupTotals } from '@/app/api/_lib/lineupGroups'
import { CURRENT_SEASON, FOCUS_TEAM_ID } from '@/lib/constants'
import { sizeCoverage } from '@/lib/analytics/lineupCombos'
import { DEFAULT_STAR_ID, OFF_GAME_SMALL_MINUTES, groupsWithout, missedGames, starOffTrend, starSplit, teammateSplits, type FocusGameLog } from '@/lib/analytics/starOff'
import type { GroupTotals } from '@/lib/analytics/lineupCombos'
import type { DriverPlayer, StarOffCandidate, StarOffData } from '@/lib/dashboard-types'

const querySchema = z.object({
  season: seasonSchema.default(CURRENT_SEASON),
  player: z.string().regex(/^\d{1,10}$/, 'Player ID must be numeric').optional(),
})

/**
 * GET /api/star-off?player=<id> — the focus team with one player (Luka Dončić by default) off the
 * floor: bench minutes from NBA.com group totals (team, teammates, lineups) and the games he missed
 * from game logs. Spec: basketball-metrics skill → "When Luka sits".
 */
export async function GET(request: NextRequest) {
  const parsed = parseSearchParams(request.nextUrl.searchParams, querySchema)
  if (!parsed.success) return badRequest(parsed.error)
  const { season, player } = parsed.data
  const teamId = FOCUS_TEAM_ID

  try {
    const [seasonInfo, groupRows, gameRows, boxScores, logs, team, teamRefs] = await Promise.all([
      getSeasonInfo(season),
      prisma.lineupGroupStats.findMany({ where: { teamId, season } }),
      prisma.lineupGroupGameStats.findMany({ where: { teamId, season } }),
      prisma.gameBoxScore.findMany({ where: { season, isPlayoff: false, OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] } }),
      prisma.playerGameLog.findMany({
        where: { teamId, season },
        select: {
          gameId: true, playerId: true, minutes: true, started: true, points: true, fieldGoals: true, fieldGoalAtt: true,
          threePointers: true, threePointAtt: true, freeThrowAtt: true, reboundsTotal: true, assists: true, turnovers: true, plusMinus: true,
        },
      }),
      prisma.team.findUnique({ where: { id: teamId }, select: { nickname: true } }),
      loadTeamRefs(),
    ])

    const onCourt = groupRows.filter((g) => g.groupSize === 1).sort((a, b) => b.minutes - a.minutes)
    const ids = new Set([...onCourt.map((g) => g.groupKey), ...logs.map((l) => l.playerId)])
    if (player) ids.add(player)
    ids.add(DEFAULT_STAR_ID)
    const people = await prisma.player.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, fullName: true, headshotUrl: true, teamId: true },
    })
    const byId = new Map(people.map((p) => [p.id, p]))
    const info = (id: string): DriverPlayer => {
      const p = byId.get(id)
      return { id, name: p?.fullName ?? `Player ${id}`, headshotUrl: p?.headshotUrl ?? null, onRoster: p?.teamId === teamId }
    }
    const surname = (id: string) => {
      const name = byId.get(id)?.fullName
      return name ? name.split(' ').slice(1).join(' ') || name : `#${id}`
    }
    const minutesOn = new Map(onCourt.map((g) => [g.groupKey, g.minutes]))
    const candidates: StarOffCandidate[] = onCourt.map((g) => ({ ...info(g.groupKey), minutes: g.minutes }))

    // the star: the one asked for, else Luka, else whoever has played the most minutes (said so)
    const dataNotes: string[] = []
    const playedFor = new Set(logs.filter((l) => (l.minutes ?? 0) > 0).map((l) => l.playerId))
    const hasData = (id: string) => minutesOn.has(id) || playedFor.has(id)
    let starId: string | null = player ?? null
    if (!starId) {
      if (hasData(DEFAULT_STAR_ID)) starId = DEFAULT_STAR_ID
      else {
        starId = candidates[0]?.id ?? null
        if (starId) dataNotes.push(`Luka Dončić has no games or on/off data for ${season}, so this shows ${info(starId).name}, the team's minutes leader. Pick another player above.`)
      }
    }
    const star: StarOffCandidate | null = starId ? { ...info(starId), minutes: minutesOn.get(starId) ?? 0 } : null
    if (player && !hasData(player)) {
      dataNotes.push(`${info(player).name} has no games or on/off minutes for the team in ${season}, so there's nothing to compare. Pick another player above.`)
    }

    // ── bench minutes (NBA.com group totals) ──
    const sizes = new Set(groupRows.map((g) => g.groupSize))
    const minutesBySize = new Map<number, number>()
    for (const g of groupRows) minutesBySize.set(g.groupSize, (minutesBySize.get(g.groupSize) ?? 0) + g.minutes)
    const coverage = sizeCoverage(minutesBySize)
    const totals = new Map(groupRows.map((g) => [g.groupKey, toGroupTotals(g)]))
    const lookup = (k: string) => totals.get(k)
    const lineupsReady = sizes.has(0) && sizes.has(1)
    let split: StarOffData['split'] = null
    let teammates: StarOffData['teammates'] = []
    let groups: StarOffData['groups'] = null
    if (!lineupsReady) {
      dataNotes.push(`NBA.com on/off totals aren't loaded for ${season} yet, so bench-minute numbers are blank. Run etl/refresh.py (its "Lineup groups" step) from a home connection.`)
    } else if (star) {
      split = starSplit(lookup, star.id, sizes, surname, team?.nickname ?? 'Team', coverage)
      if (split.off.orebPct == null && !split.off.error) dataNotes.push("NBA.com opponent totals aren't loaded, so rebounding rates without him are blank.")
      teammates = teammateSplits(lookup, star.id, onCourt.map((g) => g.groupKey), sizes, surname, coverage)
      groups = groupsWithout(lookup, star.id, groupRows, sizes, surname, coverage)
    }

    // ── games he missed (game logs) ──
    const games = boxScores.map(toGameRecord)
    const focusLogs: FocusGameLog[] = logs.map((l) => ({
      gameId: l.gameId, playerId: l.playerId, minutes: l.minutes, started: l.started, pts: l.points,
      fgm: l.fieldGoals, fga: l.fieldGoalAtt, fg3m: l.threePointers, fg3a: l.threePointAtt, fta: l.freeThrowAtt,
      reb: l.reboundsTotal, ast: l.assists, tov: l.turnovers, plusMinus: l.plusMinus,
    }))
    const m = star
      ? missedGames(teamId, star.id, games, focusLogs)
      : missedGames(teamId, '', [], [])
    if (m.gamesBeforeArrival > 0 && star) {
      dataNotes.push(`${info(star.id).name}'s first ${m.gamesBeforeArrival === 1 ? 'game' : `${m.gamesBeforeArrival} games`} of the season came before his first game for the team and aren't counted as missed.`)
    }
    const missed: StarOffData['missed'] = {
      ...m,
      games: m.games.map(({ gameDate, opponentId, ...g }) => ({ ...g, gameDate: gameDate.toISOString(), opponent: teamRefs.get(opponentId) ?? unknownTeam(opponentId) })),
    }

    // ── season trend (per-game NBA.com on/off) ──
    let trend: StarOffData['trend'] = null
    if (star && gameRows.length) {
      const byGame = new Map<string, Map<string, GroupTotals>>()
      for (const r of gameRows) {
        if (!byGame.has(r.gameId)) byGame.set(r.gameId, new Map())
        byGame.get(r.gameId)!.set(r.groupKey, toGroupTotals(r))
      }
      const inputs = games
        .filter((g) => byGame.has(g.gameId))
        .map((g) => ({ gameId: g.gameId, gameDate: g.gameDate, opponentId: g.home.teamId === teamId ? g.away.teamId : g.home.teamId, groups: byGame.get(g.gameId)! }))
      const t = starOffTrend(inputs, star.id)
      trend = {
        points: t.points.map(({ gameDate, opponentId, ...p }) => ({ ...p, gameDate: gameDate.toISOString(), opponentAbbr: (teamRefs.get(opponentId) ?? unknownTeam(opponentId)).abbreviation })),
        gamesMissed: t.gamesMissed,
        window: t.window,
        smallMinutes: OFF_GAME_SMALL_MINUTES,
        teamGames: games.length,
        gamesLoaded: inputs.length,
      }
      if (inputs.length < games.length) {
        dataNotes.push(`The season trend covers ${inputs.length} of ${games.length} games so far; run etl/refresh.py (its "Lineup games" step) from a home connection to load the rest.`)
      }
    } else if (star && lineupsReady) {
      dataNotes.push(`The season trend needs per-game on/off totals, which aren't loaded for ${season} yet. Run etl/refresh.py (its "Lineup games" step) from a home connection.`)
    }

    const used = new Set<string>([
      ...teammates.map((t) => t.playerId),
      ...(groups ? [...groups.bestPairs, ...groups.worstPairs, ...groups.bestTrios, ...groups.topFives].flatMap((r) => r.on) : []),
      ...m.teammates.map((t) => t.playerId),
      ...m.standIns.map((s) => s.playerId),
    ])
    const players = Object.fromEntries([...used].map((id) => [id, info(id)]))
    const lastUpdated = groupRows.reduce<Date | null>((max, g) => (!max || g.updatedAt > max ? g.updatedAt : max), null)

    const body: StarOffData = {
      season: seasonInfo,
      teamId,
      star,
      candidates,
      players,
      split,
      teammates,
      groups,
      missed,
      trend,
      dataNotes,
      lastUpdated: lastUpdated?.toISOString() ?? null,
    }
    return successResponse(body)
  } catch (e) {
    console.error('GET /api/star-off failed', e)
    return serverError()
  }
}
