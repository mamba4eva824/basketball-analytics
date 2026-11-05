import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/app/api/_lib/prisma'
import { successResponse, badRequest, serverError } from '@/app/api/_lib/response'
import { parseSearchParams, seasonSchema } from '@/app/api/_lib/validation'
import { getSeasonInfo, toGameRecord } from '@/app/api/_lib/dashboardData'
import { toGroupTotals } from '@/app/api/_lib/lineupGroups'
import { CURRENT_SEASON, FOCUS_TEAM_ID } from '@/lib/constants'
import { RECENT_GAMES } from '@/lib/analytics/seasonProgress'
import { boxDrivers, onOffDrivers, unattributedShare, type BoxStat, type TeamGameTotals } from '@/lib/analytics/playerDrivers'
import type { DriverPlayer, PlayerDriversData } from '@/lib/dashboard-types'

const querySchema = z.object({
  season: seasonSchema.default(CURRENT_SEASON),
})

const BOX_STATS: BoxStat[] = ['tov', 'oreb', 'dreb']

/** GET /api/progress/drivers — players behind each focus metric: box-score shares and on/off ratings. */
export async function GET(request: NextRequest) {
  const parsed = parseSearchParams(request.nextUrl.searchParams, querySchema)
  if (!parsed.success) return badRequest(parsed.error)
  const { season } = parsed.data
  const teamId = FOCUS_TEAM_ID

  try {
    const [seasonInfo, boxScores, logs, groups] = await Promise.all([
      getSeasonInfo(season),
      prisma.gameBoxScore.findMany({ where: { season, isPlayoff: false, OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] } }),
      prisma.playerGameLog.findMany({
        where: { teamId, season },
        select: { playerId: true, gameId: true, gameDate: true, minutes: true, turnovers: true, reboundsOff: true, reboundsDef: true },
      }),
      prisma.lineupGroupStats.findMany({ where: { teamId, season, groupSize: { in: [0, 1] } } }),
    ])

    const teamGames: TeamGameTotals[] = boxScores.map((b) => {
      const g = toGameRecord(b)
      const us = g.home.teamId === teamId ? g.home : g.away
      return { gameId: g.gameId, gameDate: g.gameDate, tov: us.tov, oreb: us.oreb, dreb: us.dreb }
    })
    const playerLogs = logs.map((l) => ({
      playerId: l.playerId, gameId: l.gameId, gameDate: l.gameDate, minutes: l.minutes,
      tov: l.turnovers, oreb: l.reboundsOff, dreb: l.reboundsDef,
    }))

    const box = {} as PlayerDriversData['box']
    for (const stat of BOX_STATS) {
      const drivers = boxDrivers(playerLogs, teamGames, stat)
      box[stat] = { drivers, unattributed: unattributedShare(drivers) }
    }

    const sizes = new Set(groups.map((g) => g.groupSize))
    let onOff: PlayerDriversData['onOff'] = null
    if (sizes.has(0) && sizes.has(1)) {
      const totals = new Map(groups.map((g) => [g.groupKey, toGroupTotals(g)]))
      const ids = groups.filter((g) => g.groupSize === 1).map((g) => g.groupKey)
      onOff = onOffDrivers(ids, (k) => totals.get(k), sizes)
    }

    const ids = new Set<string>([...playerLogs.map((l) => l.playerId), ...groups.filter((g) => g.groupSize === 1).map((g) => g.groupKey)])
    const people = await prisma.player.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, fullName: true, headshotUrl: true, teamId: true },
    })
    const byId = new Map(people.map((p) => [p.id, p]))
    const players: Record<string, DriverPlayer> = {}
    for (const id of ids) {
      const p = byId.get(id)
      players[id] = { id, name: p?.fullName ?? `Player ${id}`, headshotUrl: p?.headshotUrl ?? null, onRoster: p?.teamId === teamId }
    }

    const dataNotes: string[] = []
    if (seasonInfo.isDemo) dataNotes.push('Synthetic demo data — not real NBA statistics.')
    const onOffUpdated = groups.reduce<Date | null>((max, g) => (!max || g.updatedAt > max ? g.updatedAt : max), null)

    const body: PlayerDriversData = {
      season: seasonInfo,
      players,
      recentGames: RECENT_GAMES,
      teamGames: teamGames.length,
      box,
      onOff,
      onOffUpdated: onOffUpdated?.toISOString() ?? null,
      dataNotes,
    }
    return successResponse(body)
  } catch (e) {
    console.error('GET /api/progress/drivers failed', e)
    return serverError()
  }
}
