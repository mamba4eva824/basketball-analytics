import { describe, it, expect } from 'vitest'
import {
  buildLiveGame,
  currentRun,
  elapsedSeconds,
  formatClock,
  foulStatus,
  leadSummary,
  lineupStint,
  liveFactors,
  marginTimeline,
  parseClock,
  periodLabel,
  recentPlays,
  scoringEvents,
  shotsFrom,
  type RawLiveAction,
  type RawLiveBoxScore,
  type RawLivePlayer,
  type RawLiveTeam,
  type RawLiveTeamStats,
} from '@/lib/analytics/live'

let order = 0
function act(o: Partial<RawLiveAction>): RawLiveAction {
  order += 1
  return { actionNumber: order, orderNumber: order, period: 1, clock: 'PT12M00.00S', actionType: 'rebound', ...o }
}

function teamStats(o: Partial<RawLiveTeamStats> = {}): RawLiveTeamStats {
  return {
    points: 50, fieldGoalsMade: 20, fieldGoalsAttempted: 40, threePointersMade: 6, threePointersAttempted: 16,
    freeThrowsMade: 4, freeThrowsAttempted: 5, reboundsOffensive: 5, reboundsDefensive: 15, reboundsTotal: 20,
    assists: 12, steals: 4, blocks: 2, turnoversTotal: 6, foulsPersonal: 9, pointsInThePaint: 20,
    pointsSecondChance: 6, pointsFastBreak: 8, pointsFromTurnovers: 7, benchPoints: 14, leadChanges: 3, timesTied: 2,
    ...o,
  }
}

function player(id: number, o: Partial<RawLivePlayer> = {}, stats: Partial<RawLivePlayer['statistics']> = {}): RawLivePlayer {
  return {
    personId: id, name: `Player ${id}`, nameI: `P. ${id}`, starter: '1', oncourt: '1', played: '1', status: 'ACTIVE',
    statistics: {
      assists: 0, blocks: 0, fieldGoalsAttempted: 10, fieldGoalsMade: 5, foulsPersonal: 0, foulsTechnical: 0,
      freeThrowsAttempted: 0, freeThrowsMade: 0, minutes: 'PT18M30.00S', plusMinusPoints: 0, points: 10,
      reboundsDefensive: 0, reboundsOffensive: 0, reboundsTotal: 0, steals: 0, threePointersAttempted: 0,
      threePointersMade: 0, turnovers: 0, ...stats,
    },
    ...o,
  }
}

function team(id: number, tricode: string, o: Partial<RawLiveTeam> = {}): RawLiveTeam {
  return {
    teamId: id, teamName: tricode, teamCity: 'City', teamTricode: tricode, score: 50, inBonus: '0', timeoutsRemaining: 4,
    periods: [{ period: 1, score: 25 }, { period: 2, score: 25 }],
    players: [1, 2, 3, 4, 5].map((n) => player(id * 10 + n)),
    statistics: teamStats(),
    ...o,
  }
}

describe('live clock helpers', () => {
  it('parses ISO-8601 game clocks', () => {
    expect(parseClock('PT09M24.00S')).toBe(564)
    expect(parseClock('PT00M05.30S')).toBeCloseTo(5.3)
    expect(parseClock('')).toBeNull()
    expect(parseClock(undefined)).toBeNull()
  })

  it('formats seconds, rounding partial seconds up like the arena clock', () => {
    expect(formatClock(564)).toBe('9:24')
    expect(formatClock(5.3)).toBe('0:06')
    expect(formatClock(null)).toBeNull()
  })

  it('counts elapsed time across regulation and overtime', () => {
    expect(elapsedSeconds(1, 720)).toBe(0)
    expect(elapsedSeconds(3, 564)).toBe(1440 + 156)
    expect(elapsedSeconds(5, 300)).toBe(2880)
    expect(elapsedSeconds(6, 0)).toBe(2880 + 600)
  })

  it('labels periods', () => {
    expect(periodLabel(2)).toBe('Q2')
    expect(periodLabel(5)).toBe('OT')
    expect(periodLabel(7)).toBe('3OT')
  })
})

describe('foulStatus', () => {
  it('flags 2 in Q1, 3 in Q2, 4 in Q3, 5 in Q4 and OT', () => {
    expect(foulStatus(1, 1)).toBeNull()
    expect(foulStatus(2, 1)).toBe('trouble')
    expect(foulStatus(2, 2)).toBeNull()
    expect(foulStatus(3, 2)).toBe('trouble')
    expect(foulStatus(4, 3)).toBe('trouble')
    expect(foulStatus(4, 4)).toBeNull()
    expect(foulStatus(5, 6)).toBe('trouble')
    expect(foulStatus(6, 2)).toBe('fouled-out')
  })
})

describe('liveFactors', () => {
  it('uses the season formulas on the game so far, rating on mean possessions', () => {
    const us = teamStats({ points: 60, fieldGoalsMade: 22, threePointersMade: 10, fieldGoalsAttempted: 40, freeThrowsAttempted: 10, reboundsOffensive: 4, turnoversTotal: 5 })
    const them = teamStats({ points: 50, fieldGoalsAttempted: 46, freeThrowsAttempted: 5, reboundsOffensive: 8, reboundsDefensive: 16, turnoversTotal: 9 })
    const f = liveFactors(us, them)
    // poss = 40 + 4.4 − 4 + 5 = 45.4 ; theirs = 46 + 2.2 − 8 + 9 = 49.2 ; mean 47.3
    expect(f.possessions).toBeCloseTo(45.4)
    expect(f.offRtg).toBeCloseTo((100 * 60) / 47.3)
    expect(f.efgPct).toBeCloseTo((22 + 5) / 40)
    expect(f.tovPct).toBeCloseTo(5 / (40 + 4.4 + 5))
    expect(f.orebPct).toBeCloseTo(4 / (4 + 16))
    expect(f.ftRate).toBeCloseTo(10 / 40)
  })

  it('returns null rates, not zeros, before any shot', () => {
    const zero = teamStats({ points: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 0, threePointersMade: 0, threePointersAttempted: 0, freeThrowsMade: 0, freeThrowsAttempted: 0, reboundsOffensive: 0, reboundsDefensive: 0, turnoversTotal: 0 })
    const f = liveFactors(zero, zero)
    expect(f.efgPct).toBeNull()
    expect(f.offRtg).toBeNull()
    expect(f.threePct).toBeNull()
  })
})

describe('play-by-play derived', () => {
  const plays = (): RawLiveAction[] => {
    order = 0
    return [
      act({ actionType: 'period', subType: 'start', scoreHome: '0', scoreAway: '0' }),
      act({ actionType: '2pt', teamTricode: 'HOM', clock: 'PT11M30.00S', scoreHome: '2', scoreAway: '0', isFieldGoal: 1, shotResult: 'Made', xLegacy: 10, yLegacy: 20, personId: 11, description: 'HOM layup' }),
      act({ actionType: '3pt', teamTricode: 'AWY', clock: 'PT11M00.00S', scoreHome: '2', scoreAway: '3', isFieldGoal: 1, shotResult: 'Made', xLegacy: 220, yLegacy: 50, personId: 21, description: 'AWY three' }),
      act({ actionType: 'substitution', teamTricode: 'AWY', clock: 'PT10M40.00S', scoreHome: '2', scoreAway: '3', description: 'SUB in' }),
      act({ actionType: '2pt', teamTricode: 'AWY', clock: 'PT10M20.00S', scoreHome: '2', scoreAway: '5', isFieldGoal: 1, shotResult: 'Made', xLegacy: 0, yLegacy: 5, personId: 22, description: 'AWY dunk' }),
      act({ actionType: '2pt', teamTricode: 'HOM', clock: 'PT10M00.00S', scoreHome: '2', scoreAway: '5', isFieldGoal: 1, shotResult: 'Missed', xLegacy: 100, yLegacy: 100, personId: 12, description: 'MISS HOM jumper' }),
      act({ actionType: 'freethrow', teamTricode: 'AWY', clock: 'PT09M50.00S', scoreHome: '2', scoreAway: '6', description: 'AWY FT' }),
    ]
  }

  it('finds every score change and attributes the points', () => {
    const ev = scoringEvents(plays())
    expect(ev.map((e) => [e.side, e.points])).toEqual([['home', 2], ['away', 3], ['away', 2], ['away', 1]])
  })

  it('builds the margin from the focus team side, starting at 0', () => {
    const ev = scoringEvents(plays())
    expect(marginTimeline(ev, false).map((p) => p.margin)).toEqual([0, -2, 1, 3, 4])
    expect(marginTimeline(ev, true).at(-1)?.margin).toBe(-4)
  })

  it('reports the current unanswered run', () => {
    const run = currentRun(scoringEvents(plays()), { home: 'HOM', away: 'AWY' })
    expect(run).toEqual({ tricode: 'AWY', points: 6, since: 'Q1 11:00' })
    expect(currentRun([], { home: 'HOM', away: 'AWY' })).toBeNull()
  })

  it('summarizes biggest lead, longest run and time ahead from the scoring', () => {
    // HOM 2-0 at 0:30, AWY 3-2 at 1:00, 5-2 at 1:40, 6-2 at 2:10; now 3:00
    const { home, away } = leadSummary(scoringEvents(plays()), 180)
    expect(home).toEqual({ biggestLead: 2, longestRun: 2, timeLeadingSec: 30 })
    expect(away).toEqual({ biggestLead: 4, longestRun: 6, timeLeadingSec: 120 })
  })

  it('treats a score taken back as a correction, not a score for the other side', () => {
    order = 0
    const actions = [
      act({ actionType: 'period', scoreHome: '0', scoreAway: '0' }),
      act({ actionType: '2pt', teamTricode: 'AWY', clock: 'PT11M40.00S', scoreHome: '0', scoreAway: '2', description: 'AWY layup' }),
      act({ actionType: '2pt', teamTricode: 'HOM', clock: 'PT11M20.00S', scoreHome: '2', scoreAway: '2', description: 'HOM layup' }),
      act({ actionType: '3pt', teamTricode: 'HOM', clock: 'PT11M00.00S', scoreHome: '5', scoreAway: '2', description: 'HOM three' }),
      act({ actionType: 'instantreplay', teamTricode: 'HOM', clock: 'PT10M50.00S', scoreHome: '2', scoreAway: '2', description: 'Challenge: overturned' }),
      act({ actionType: '2pt', teamTricode: 'HOM', clock: 'PT10M30.00S', scoreHome: '4', scoreAway: '2', description: 'HOM jumper' }),
    ]
    const ev = scoringEvents(actions)
    expect(ev.find((e) => e.correction)).toMatchObject({ side: 'home', points: 0 })
    expect(marginTimeline(ev, true).map((p) => p.margin)).toEqual([0, -2, 0, 3, 0, 2])
    // the overturned three is gone: HOM's run is 2 + 2, not interrupted by a phantom AWY score
    expect(currentRun(ev, { home: 'HOM', away: 'AWY' })).toEqual({ tricode: 'HOM', points: 4, since: 'Q1 11:20' })
    expect(leadSummary(ev, 120).home.longestRun).toBe(4)
    expect(recentPlays(actions).map((p) => p.scoring)).toEqual([true, false, true, true, true])
  })

  it('measures the current five from their last substitution', () => {
    const stint = lineupStint(plays(), { tricode: 'AWY', isHome: false, onCourtIds: ['5', '4', '3', '2', '1'], period: 1, elapsedNow: 130 })
    expect(stint).toEqual({ playerIds: ['1', '2', '3', '4', '5'], since: 'Q1 10:40', seconds: 130 - 80, pointsFor: 3, pointsAgainst: 0 })
  })

  it('falls back to the period start when the team has not subbed this period', () => {
    const stint = lineupStint(plays(), { tricode: 'HOM', isHome: true, onCourtIds: ['1', '2', '3', '4', '5'], period: 1, elapsedNow: 130 })
    expect(stint?.since).toBe('Q1 12:00')
    expect(stint?.pointsFor).toBe(2)
    expect(stint?.pointsAgainst).toBe(6)
  })

  it('needs exactly five players on court', () => {
    expect(lineupStint(plays(), { tricode: 'HOM', isHome: true, onCourtIds: ['1', '2'], period: 1, elapsedNow: 10 })).toBeNull()
  })

  it('extracts shots with coordinates and make/miss', () => {
    const shots = shotsFrom(plays())
    expect(shots).toHaveLength(4)
    expect(shots.filter((s) => s.made)).toHaveLength(3)
    expect(shots.find((s) => s.isThree)?.x).toBe(220)
  })

  it('lists recent plays newest first, skipping substitutions, and marks scores', () => {
    const recent = recentPlays(plays(), 3)
    expect(recent.map((p) => p.description)).toEqual(['AWY FT', 'MISS HOM jumper', 'AWY dunk'])
    expect(recent.map((p) => p.scoring)).toEqual([true, false, true])
    expect(recent[0].score).toBe('6-2')
  })
})

describe('buildLiveGame', () => {
  const box = (o: Partial<RawLiveBoxScore> = {}): RawLiveBoxScore => ({
    gameId: '0022600001', gameStatus: 2, gameStatusText: 'Q2 6:00 ', period: 2, gameClock: 'PT06M00.00S',
    gameTimeUTC: '2026-10-25T21:00:00Z', regulationPeriods: 4, arena: { arenaName: 'Arena', arenaCity: 'Town' },
    homeTeam: team(1610612762, 'UTA', { players: [1, 2, 3, 4, 5].map((n) => player(n)).concat(player(9, { starter: '0', oncourt: '0', played: '0', status: 'INACTIVE', notPlayingReason: 'INACTIVE_INJURY', notPlayingDescription: 'Foot' })) }),
    awayTeam: team(1610612747, 'LAL', { players: [player(31, {}, { foulsPersonal: 3 }), ...[32, 33, 34, 35].map((n) => player(n))] }),
    ...o,
  })

  it('orients the game around the focus team and flags foul trouble', () => {
    order = 0
    const g = buildLiveGame(box(), [act({ actionType: 'period', scoreHome: '0', scoreAway: '0' })], '1610612747', new Date('2026-10-25T22:00:00Z'))
    expect(g.focus.tricode).toBe('LAL')
    expect(g.focus.isHome).toBe(false)
    expect(g.opponent.tricode).toBe('UTA')
    expect(g.statusText).toBe('Q2 6:00')
    expect(g.clock).toBe('6:00')
    expect(g.elapsedSec).toBe(720 + 360)
    expect(g.arena).toBe('Arena, Town')
    expect(g.focus.players[0].foul).toBe('trouble')
    expect(g.focus.players[0].minutes).toBeCloseTo(18.5)
    expect(g.opponent.players.at(-1)).toMatchObject({ inactive: true, inactiveReason: 'Foot' })
    expect(g.focus.inBonus).toBe(false)
  })

  it('skips the lineup stint once the game is final', () => {
    order = 0
    const g = buildLiveGame(box({ gameStatus: 3, period: 4, gameClock: '' }), [act({ actionType: 'period', scoreHome: '0', scoreAway: '0' })], '1610612747', new Date())
    expect(g.focus.lineup).toBeNull()
    expect(g.elapsedSec).toBe(2880)
    expect(g.clock).toBeNull()
  })
})
