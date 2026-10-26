import { describe, it, expect } from 'vitest'
import {
  buildTeamProfiles,
  leagueBaseline,
  possessions,
  type BoxSide,
  type GameRecord,
} from '@/lib/analytics/teamProfiles'
import { rankTeams, rankProfiles } from '@/lib/analytics/ranks'
import { normalCdf, projectGame, regress } from '@/lib/analytics/projection'
import { fourFactorEdges, verdictFor } from '@/lib/analytics/matchup'
import { classifyPlayer, gamesStartedByPlayer, newcomerMinutesShare, roleMinutes, startKey } from '@/lib/analytics/roster'
import { gameRatings, rollingMean } from '@/lib/analytics/trend'
import { absenceKind, plusMinusTrend } from '@/lib/analytics/plusMinus'
import { seasonLineFromLogs, summarizeForm, trendOf, trueShooting } from '@/lib/analytics/form'
import { startingLineups } from '@/lib/analytics/lineups'
import { seasonForDate, previousSeason } from '@/lib/constants'
import { gameDay } from '@/lib/format'

function side(teamId: string, o: Partial<BoxSide> = {}): BoxSide {
  return {
    teamId,
    pts: 110,
    fgm: 40,
    fga: 88,
    fg3m: 12,
    fg3a: 35,
    ftm: 18,
    fta: 22,
    oreb: 10,
    dreb: 33,
    tov: 13,
    ...o,
  }
}

function game(id: string, date: string, home: BoxSide, away: BoxSide): GameRecord {
  return { gameId: id, gameDate: new Date(date), home, away }
}

describe('season helpers', () => {
  it('rolls over on Oct 1', () => {
    expect(seasonForDate(new Date('2026-09-30T12:00:00Z'))).toBe('2025-26')
    expect(seasonForDate(new Date('2026-10-01T12:00:00Z'))).toBe('2026-27')
    expect(seasonForDate(new Date('2027-03-15T12:00:00Z'))).toBe('2026-27')
    expect(seasonForDate(new Date('2099-12-01T00:00:00Z'))).toBe('2099-00')
  })
  it('uses US Eastern time at the boundary', () => {
    // 01:00 UTC Oct 1 is still Sep 30 in New York
    expect(seasonForDate(new Date('2026-10-01T01:00:00Z'))).toBe('2025-26')
    expect(seasonForDate(new Date('2026-10-01T05:00:00Z'))).toBe('2026-27')
  })
  it('computes previous season', () => {
    expect(previousSeason('2026-27')).toBe('2025-26')
    expect(previousSeason('2000-01')).toBe('1999-00')
  })
})

describe('buildTeamProfiles', () => {
  const g1 = game('1', '2026-10-21', side('LAL', { pts: 120 }), side('GSW', { pts: 100, oreb: 8, dreb: 30 }))
  const g2 = game('2', '2026-10-23', side('PHX', { pts: 105 }), side('LAL', { pts: 99, tov: 20 }))

  it('computes possessions from the box score', () => {
    expect(possessions(side('X'))).toBeCloseTo(88 + 0.44 * 22 - 10 + 13)
  })

  it('aggregates totals and record per team', () => {
    const p = buildTeamProfiles([g1, g2]).get('LAL')!
    expect(p.games).toBe(2)
    expect(p.wins).toBe(1)
    expect(p.losses).toBe(1)
    expect(p.ppg).toBeCloseTo((120 + 99) / 2)
    expect(p.oppPpg).toBeCloseTo((100 + 105) / 2)
    expect(p.netRtg).toBeCloseTo(p.offRtg! - p.defRtg!)
    // eFG from totals: (80 + 0.5*24) / 176
    expect(p.efgPct).toBeCloseTo((80 + 12) / 176)
    // OREB% = our OREB / (our OREB + their DREB)
    expect(p.orebPct).toBeCloseTo(20 / (20 + 30 + 33))
    expect(p.ftRate).toBeCloseTo(44 / 176)
  })

  it('ORtg is points per 100 shared possessions', () => {
    const p = buildTeamProfiles([g1]).get('LAL')!
    const poss = (possessions(g1.home)! + possessions(g1.away)!) / 2
    expect(p.offRtg).toBeCloseTo((100 * 120) / poss)
    expect(p.defRtg).toBeCloseTo((100 * 100) / poss)
    expect(p.pace).toBeCloseTo(poss)
  })

  it('respects lastN by date, not input order', () => {
    const p = buildTeamProfiles([g2, g1], { lastN: 1 }).get('LAL')!
    expect(p.games).toBe(1)
    expect(p.ppg).toBe(99)
  })

  it('nulls OREB% when rebound splits are missing', () => {
    const g = game('3', '2026-10-25', side('LAL', { oreb: null }), side('BOS'))
    expect(buildTeamProfiles([g1, g]).get('LAL')!.orebPct).toBeNull()
  })

  it('excludes games without OREB from ratings instead of treating OREB as 0', () => {
    expect(possessions(side('X', { oreb: null }))).toBeNull()
    const missing = game('3', '2026-10-25', side('LAL', { oreb: null, pts: 150 }), side('BOS'))
    const withMissing = buildTeamProfiles([g1, missing]).get('LAL')!
    const only = buildTeamProfiles([g1]).get('LAL')!
    expect(withMissing.games).toBe(2) // record + per-game stats still count it
    expect(withMissing.offRtg).toBeCloseTo(only.offRtg!) // ratings only use measurable games
    expect(withMissing.pace).toBeCloseTo(only.pace!)
    expect(withMissing.team.possGames).toBe(1)
    const none = buildTeamProfiles([missing]).get('LAL')!
    expect([none.offRtg, none.defRtg, none.netRtg, none.pace]).toEqual([null, null, null, null])
  })

  it('league baseline is possession-weighted', () => {
    const profiles = buildTeamProfiles([g1, g2])
    const base = leagueBaseline(profiles.values())!
    const all = [...profiles.values()]
    const pts = all.reduce((a, p) => a + p.team.pts, 0)
    const poss = all.reduce((a, p) => a + p.team.poss, 0)
    expect(base.offRtg).toBeCloseTo((100 * pts) / poss)
    expect(base.teams).toBe(3)
  })
})

describe('rankTeams', () => {
  it('ranks higher-is-better with shared ties', () => {
    const r = rankTeams(
      [
        { teamId: 'A', value: 110 },
        { teamId: 'B', value: 115 },
        { teamId: 'C', value: 110 },
        { teamId: 'D', value: 100 },
        { teamId: 'E', value: null },
      ],
      'higher',
    )
    expect([r.get('B'), r.get('A'), r.get('C'), r.get('D'), r.get('E')]).toEqual([1, 2, 2, 4, null])
  })
  it('ranks lower-is-better (DRtg)', () => {
    const r = rankTeams([{ teamId: 'A', value: 105 }, { teamId: 'B', value: 112 }], 'lower')
    expect(r.get('A')).toBe(1)
    expect(r.get('B')).toBe(2)
  })
})

describe('projection', () => {
  it('regresses toward the league mean by K games', () => {
    expect(regress(130, 0, 115)).toBe(115)
    expect(regress(130, 10, 115)).toBeCloseTo(122.5)
  })
  it('normalCdf is accurate', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6)
    expect(normalCdf(1)).toBeCloseTo(0.841345, 5)
    expect(normalCdf(-1.96)).toBeCloseTo(0.024998, 5)
  })
  it('identical teams: home court decides, ~2-pt margin', () => {
    const games = [
      game('1', '2026-10-21', side('A'), side('B')),
      game('2', '2026-10-22', side('B'), side('A')),
    ]
    const profiles = buildTeamProfiles(games)
    const base = leagueBaseline(profiles.values())!
    const proj = projectGame(profiles.get('A')!, profiles.get('B')!, base)!
    expect(proj.margin).toBeCloseTo(2)
    expect(proj.homeWinProb).toBeGreaterThan(0.5)
    expect(proj.smallSample).toBe(true)
    expect(projectGame(profiles.get('A')!, profiles.get('B')!, base, { neutral: true })!.margin).toBeCloseTo(0)
  })
  it('returns null when a team has no measurable possessions', () => {
    const profiles = buildTeamProfiles([
      game('1', '2026-10-21', side('A', { oreb: null }), side('B')),
      game('2', '2026-10-22', side('C'), side('D')),
    ])
    const base = leagueBaseline(profiles.values())!
    expect(projectGame(profiles.get('A')!, profiles.get('C')!, base)).toBeNull()
  })
})

describe('fourFactorEdges', () => {
  it('flags advantages by rank gap in the right direction', () => {
    expect(verdictFor(6)).toBe('advantage')
    expect(verdictFor(5)).toBe('even')
    expect(verdictFor(-6)).toBe('disadvantage')
    expect(verdictFor(null)).toBeNull()

    // A shoots well and protects the ball; B defends poorly.
    const games = [
      game('1', '2026-10-21', side('A', { fgm: 48, tov: 8 }), side('B', { fgm: 36, tov: 18 })),
      game('2', '2026-10-22', side('C'), side('D')),
    ]
    const profiles = buildTeamProfiles(games)
    const ranks = rankProfiles(profiles.values())
    const edges = fourFactorEdges(
      { profile: profiles.get('A')!, ranks: ranks.get('A')! },
      { profile: profiles.get('B')!, ranks: ranks.get('B')! },
    )
    expect(edges).toHaveLength(8)
    const efgOff = edges.find((e) => e.side === 'offense' && e.factor === 'efg')!
    expect(efgOff.ours.rank).toBe(1)
    expect(efgOff.theirs.metric).toBe('oppEfgPct')
    expect(efgOff.theirs.rank).toBe(4) // B allowed the best shooting → worst defense
    expect(efgOff.rankGap).toBe(3)
  })
})

describe('classifyPlayer', () => {
  const base = { focusTeamId: 'LAL', currentStartYear: 2026 }
  it('returning when last season was with the focus team', () => {
    expect(classifyPlayer({ ...base, fromYear: 2018, priorSeasonRows: [{ teamId: 'LAL', gamesPlayed: 70 }] }).status).toBe('returning')
  })
  it('new with the main prior team as baseline', () => {
    const c = classifyPlayer({
      ...base,
      fromYear: 2019,
      priorSeasonRows: [{ teamId: 'UTA', gamesPlayed: 50 }, { teamId: 'CHA', gamesPlayed: 12 }],
    })
    expect(c).toEqual({ status: 'new', baselineTeamId: 'UTA' })
  })
  it('rookie when no prior season and first year is now', () => {
    expect(classifyPlayer({ ...base, fromYear: 2026, priorSeasonRows: [] }).status).toBe('rookie')
  })
  it('veteran with no prior-season row is new, not rookie', () => {
    expect(classifyPlayer({ ...base, fromYear: 2015, priorSeasonRows: [] })).toEqual({ status: 'new', baselineTeamId: null })
  })
})

describe('form', () => {
  const log = (d: string, pts: number, o: Record<string, unknown> = {}) => ({
    gameDate: new Date(d),
    minutes: 30,
    points: pts,
    rebounds: 5,
    assists: 4,
    fga: 15,
    fta: 5,
    fg3m: 2,
    plusMinus: 3,
    ...o,
  })
  it('averages the last N games played and skips DNPs', () => {
    const s = summarizeForm(
      [log('2026-10-21', 10), log('2026-10-23', 20), log('2026-10-25', 0, { minutes: 0, dnp: true }), log('2026-10-27', 30)],
      2,
    )
    expect(s.games).toBe(2)
    expect(s.points).toBe(25)
    expect(s.tsPct).toBeCloseTo(50 / (2 * (30 + 0.44 * 10)))
  })
  it('empty window returns nulls', () => {
    expect(summarizeForm([]).points).toBeNull()
  })
  it('trueShooting guards zero attempts', () => {
    expect(trueShooting(0, 0, 0)).toBeNull()
  })
  it('trend uses a ±10% band', () => {
    expect(trendOf(22, 20)).toBe('up')
    expect(trendOf(21, 20)).toBe('flat')
    expect(trendOf(17, 20)).toBe('down')
    expect(trendOf(null, 20)).toBeNull()
  })
})

describe('startingLineups', () => {
  it('groups games by starting five and skips incomplete games', () => {
    const five = ['a', 'b', 'c', 'd', 'e']
    const logs = [
      ...five.map((p) => ({ gameId: 'g1', playerId: p, started: true })),
      ...[...five].reverse().map((p) => ({ gameId: 'g2', playerId: p, started: true })),
      ...['a', 'b', 'c', 'd'].map((p) => ({ gameId: 'g3', playerId: p, started: true })),
      { gameId: 'g1', playerId: 'z', started: false },
    ]
    const outcomes = [
      { gameId: 'g1', gameDate: new Date('2026-10-21'), won: true, margin: 10 },
      { gameId: 'g2', gameDate: new Date('2026-10-23'), won: false, margin: -4 },
      { gameId: 'g3', gameDate: new Date('2026-10-25'), won: true, margin: 2 },
    ]
    const { units, gamesMissingStarterData } = startingLineups(logs, outcomes)
    expect(gamesMissingStarterData).toBe(1)
    expect(units).toHaveLength(1)
    expect(units[0]).toMatchObject({ playerIds: five, games: 2, wins: 1, losses: 1, avgMargin: 3 })
    expect(units[0].lastUsed).toEqual(new Date('2026-10-23'))
  })
})

describe('trend', () => {
  it('rollingMean is a trailing window', () => {
    expect(rollingMean([10, 20, 30, 40, 50, 60], 3)).toEqual([10, 15, 20, 30, 40, 50])
  })
  it('gameRatings orders by date, skips unmeasurable games, rolls net rating', () => {
    const games = [
      game('2', '2026-10-23', side('PHX', { pts: 105 }), side('LAL', { pts: 99 })),
      game('1', '2026-10-21', side('LAL', { pts: 120 }), side('GSW', { pts: 100 })),
      game('3', '2026-10-25', side('LAL', { oreb: null }), side('BOS')),
    ]
    const r = gameRatings(games, 'LAL')
    expect(r.map((x) => x.gameId)).toEqual(['1', '2'])
    expect(r[0]).toMatchObject({ opponentId: 'GSW', won: true })
    expect(r[1].won).toBe(false)
    expect(r[1].rollingNet).toBeCloseTo((r[0].netRtg + r[1].netRtg) / 2)
  })
})

describe('roster minutes', () => {
  it('newcomerMinutesShare counts new + rookie minutes', () => {
    const status = new Map([['a', 'new'], ['b', 'returning'], ['c', 'rookie']] as const)
    expect(
      newcomerMinutesShare(
        [{ playerId: 'a', minutes: 30 }, { playerId: 'b', minutes: 50 }, { playerId: 'c', minutes: 20 }, { playerId: 'x', minutes: null }],
        new Map(status),
      ),
    ).toBeCloseTo(0.5)
    expect(newcomerMinutesShare([], new Map())).toBeNull()
  })
  it('roleMinutes keeps an injured star ahead of a bench player', () => {
    const injuredStar = roleMinutes(null, { minutes: 35 })
    const bench = roleMinutes({ minutes: 14, gamesPlayed: 3 }, { minutes: 12 })
    expect(injuredStar).toBeGreaterThan(bench)
    expect(roleMinutes({ minutes: 20, gamesPlayed: 8 }, { minutes: 34 })).toBe(20) // established role wins
  })
})

describe('gamesStartedByPlayer', () => {
  const LAL = 'lal'
  const fiveStarters = (gameId: string, teamId: string) =>
    Array.from({ length: 5 }, () => ({ gameId, teamId }))
  const log = (playerId: string, gameId: string, started: boolean, season = '2026-27', teamId = LAL) =>
    ({ playerId, teamId, season, gameId, started })

  it('counts starts across flagged games', () => {
    const starts = gamesStartedByPlayer(
      [log('luka', 'g1', true), log('luka', 'g2', true), log('bench', 'g1', false), log('bench', 'g2', true)],
      [...fiveStarters('g1', LAL), ...fiveStarters('g2', LAL)],
    )
    expect(starts.get(startKey('luka', LAL, '2026-27'))).toBe(2)
    expect(starts.get(startKey('bench', LAL, '2026-27'))).toBe(1)
  })
  it('leaves a player out ("—") when any game lacks flagged starters or there are no logs', () => {
    const starts = gamesStartedByPlayer(
      [log('luka', 'g1', true), log('luka', 'g2', false), log('luka', 'g0', false, '2025-26', 'dal')],
      fiveStarters('g1', LAL), // g2 not flagged yet; last season's game never flagged
    )
    expect(starts.has(startKey('luka', LAL, '2026-27'))).toBe(false)
    expect(starts.has(startKey('luka', 'dal', '2025-26'))).toBe(false)
    expect(starts.has(startKey('rookie', LAL, '2026-27'))).toBe(false)
  })
  it('counts a flagged game for one team, not the other', () => {
    const starts = gamesStartedByPlayer(
      [log('luka', 'g1', true), log('opp', 'g1', false, '2026-27', 'uta')],
      [...fiveStarters('g1', LAL), { gameId: 'g1', teamId: 'uta' }],
    )
    expect(starts.get(startKey('luka', LAL, '2026-27'))).toBe(1)
    expect(starts.has(startKey('opp', 'uta', '2026-27'))).toBe(false)
  })
})

describe('plusMinusTrend', () => {
  const slots = Array.from({ length: 10 }, (_, i) => ({
    gameId: `g${i + 1}`,
    date: new Date(Date.UTC(2026, 9, 21 + i * 2)),
    opponentAbbr: 'OPP',
    won: i % 2 === 0,
  }))
  const line = (n: number, plusMinus: number, minutes = 30) => ({ gameId: `g${n}`, plusMinus, minutes })

  it('treats missed games as gaps, not zeros, so an absence does not flatten the average', () => {
    // +10 every game played; injured for games 4-7
    const lines = [1, 2, 3, 8, 9, 10].map((n) => line(n, 10))
    const { points, summary } = plusMinusTrend(slots, lines, { window: 5 })
    expect(points.map((p) => p.availability)).toEqual([
      'played', 'played', 'played', 'missed', 'missed', 'missed', 'missed', 'played', 'played', 'played',
    ])
    expect(points[3].rollingAvg).toBeNull() // gap on the chart
    expect(points[7].rollingAvg).toBe(10) // still 10 on return — zero-filling would give 4
    expect(summary).toMatchObject({ gamesPlayed: 6, gamesMissed: 4, seasonAvg: 10 })
    expect(summary.absences).toEqual([{ startGameId: 'g4', endGameId: 'g7', games: 4, reason: null, kind: 'unknown', ongoing: false }])
  })

  it('rolls over the last N games played', () => {
    const lines = [1, 2, 3, 4, 5, 6].map((n) => line(n, n))
    const { points } = plusMinusTrend(slots, lines, { window: 3 })
    expect(points[0]).toMatchObject({ rollingAvg: 1, windowGames: 1 })
    expect(points[5]).toMatchObject({ rollingAvg: 5, windowGames: 3 }) // (4+5+6)/3
  })

  it('per-36 is minutes-weighted so a limited-minutes return game is not over-weighted', () => {
    const lines = [line(1, 12, 36), line(2, 12, 36), line(3, 1, 6)] // back on a minutes limit
    const { points, summary } = plusMinusTrend(slots, lines, { window: 3 })
    expect(points[2].rollingPer36).toBeCloseTo((36 * 25) / 78)
    expect(points[2].rollingAvg).toBeCloseTo(25 / 3)
    expect(summary.seasonPer36).toBeCloseTo((36 * 25) / 78)
  })

  it('games before a mid-season arrival are not counted as missed', () => {
    const lines = [5, 6, 7, 8, 9, 10].map((n) => line(n, 2))
    const { points, summary } = plusMinusTrend(slots, lines, { joinedAfter: slots[3].date })
    expect(points.slice(0, 4).every((p) => p.availability === 'not-with-team')).toBe(true)
    expect(summary.gamesMissed).toBe(0)
  })

  it('labels an ongoing absence with the current injury and keeps DNP reasons', () => {
    const lines = [line(1, 3), { gameId: 'g2', minutes: 0, plusMinus: null, dnp: true, dnpReason: 'Rest' }, ...[3, 4, 5, 6, 7, 8].map((n) => line(n, 3))]
    const { points, summary } = plusMinusTrend(slots, lines, { currentInjury: 'Out — Ankle' })
    expect(points[1]).toMatchObject({ availability: 'missed', missedReason: 'Rest' })
    expect(summary.absences.at(-1)).toMatchObject({ startGameId: 'g9', games: 2, ongoing: true, reason: 'Out — Ankle', kind: 'injury' })
    expect(points[9].missedReason).toBe('Out — Ankle')
    expect(summary.absences[0]).toMatchObject({ reason: 'Rest', kind: 'other', ongoing: false })
  })

  it('only calls an absence an injury when there is evidence', () => {
    expect(absenceKind(null)).toBe('unknown') // healthy scratch and injury look the same in a box score
    expect(absenceKind('Left knee soreness')).toBe('injury')
    expect(absenceKind("Coach's decision")).toBe('other')
    expect(absenceKind('Day-To-Day', true)).toBe('injury')
  })

  it('trend compares the last window with the season average in points', () => {
    const rising = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => line(n, n <= 5 ? -5 : 8))
    expect(plusMinusTrend(slots, rising, { window: 5 }).summary.trend).toBe('up')
    const steady = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => line(n, 4))
    expect(plusMinusTrend(slots, steady, { window: 5 }).summary.trend).toBe('flat')
    expect(plusMinusTrend(slots, steady.slice(0, 4), { window: 5 }).summary.trend).toBeNull() // too few games
    expect(plusMinusTrend(slots, []).summary).toMatchObject({ gamesPlayed: 0, gamesMissed: 10, seasonAvg: null })
  })
})

describe('gameDay', () => {
  it('reads a stored midnight-UTC game date as that calendar day locally', () => {
    const d = gameDay('2026-10-21T00:00:00.000Z')
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 21])
    expect(gameDay(new Date('2026-10-21T00:00:00Z')).getDate()).toBe(21)
  })
})

describe('seasonLineFromLogs', () => {
  const log = (o: Partial<Parameters<typeof seasonLineFromLogs>[0][number]> = {}) => ({
    gameDate: new Date('2026-10-21'), minutes: 30, points: 20, rebounds: 5, assists: 4, fga: 15, fta: 5, fg3m: 2,
    plusMinus: 5, dnp: false, fgm: 7, fg3a: 6, ftm: 4, steals: 1, blocks: 0, turnovers: 3, ...o,
  })

  it('averages games played and takes percentages from totals', () => {
    const l = seasonLineFromLogs([log(), log({ points: 30, fgm: 11, fga: 20, fg3m: 4, fg3a: 8, plusMinus: -5 }), log({ dnp: true, minutes: 0 })])!
    expect(l.gamesPlayed).toBe(2)
    expect(l.points).toBe(25)
    expect(l.fgPct).toBeCloseTo(18 / 35)
    expect(l.threePct).toBeCloseTo(6 / 14)
    expect(l.tsPct).toBeCloseTo(50 / (2 * (35 + 0.44 * 10)))
    expect(l.plusMinus).toBe(0)
  })

  it('is null before the player has played', () => {
    expect(seasonLineFromLogs([])).toBeNull()
    expect(seasonLineFromLogs([log({ dnp: true, minutes: 0 })])).toBeNull()
  })
})
