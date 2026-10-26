import { describe, it, expect } from 'vitest'
import { buildSchedule, scheduleState, summarizeSchedule, type ScheduleRow } from '@/lib/analytics/schedule'
import { leagueDate } from '@/lib/constants'

const LAL = '1610612747'

function row(gameId: string, utc: string, dateEt: string, o: Partial<ScheduleRow> = {}): ScheduleRow {
  return { gameId, gameDateUtc: new Date(utc), gameDateEt: dateEt, status: 1, homeTeamId: LAL, awayTeamId: 'OPP', homeScore: null, awayScore: null, ...o }
}

const now = new Date('2026-10-25T22:00:00Z') // Oct 25, 6 pm ET

describe('leagueDate', () => {
  it('uses the US Eastern calendar date', () => {
    expect(leagueDate(new Date('2026-10-26T03:30:00Z'))).toBe('2026-10-25') // 11:30 pm ET
    expect(leagueDate(new Date('2026-10-26T04:30:00Z'))).toBe('2026-10-26')
  })
})

describe('scheduleState', () => {
  it('needs a final status and both scores to be final', () => {
    expect(scheduleState(row('a', '2026-10-22T02:00:00Z', '2026-10-21', { status: 3, homeScore: 110, awayScore: 100 }), now)).toBe('final')
    expect(scheduleState(row('a', '2026-10-22T02:00:00Z', '2026-10-21', { status: 3 }), now)).toBe('pending')
  })

  it("flags today's game, stale past games and future games", () => {
    expect(scheduleState(row('a', '2026-10-25T21:00:00Z', '2026-10-25', { status: 2 }), now)).toBe('today')
    expect(scheduleState(row('a', '2026-10-24T02:00:00Z', '2026-10-23', { status: 2 }), now)).toBe('pending')
    expect(scheduleState(row('a', '2026-10-28T03:00:00Z', '2026-10-27'), now)).toBe('scheduled')
  })

  it('keeps a late tip in progress after midnight ET as today, not scheduled', () => {
    // 10:30 pm ET tip on Oct 27; at 12:05 am ET (Oct 28) the game is 1.5 h old
    const late = row('a', '2026-10-28T02:30:00Z', '2026-10-27', { status: 2 })
    expect(scheduleState(late, new Date('2026-10-28T04:05:00Z'))).toBe('today')
    expect(scheduleState(late, new Date('2026-10-28T07:00:00Z'))).toBe('pending')
  })
})

describe('buildSchedule', () => {
  const rows = [
    row('3', '2026-10-25T21:00:00Z', '2026-10-25', { homeTeamId: 'UTA', awayTeamId: LAL, status: 2 }),
    row('1', '2026-10-22T02:00:00Z', '2026-10-21', { status: 3, homeScore: 127, awayScore: 105 }),
    row('2', '2026-10-24T02:00:00Z', '2026-10-23', { homeTeamId: 'LAC', awayTeamId: LAL, status: 3, homeScore: 117, awayScore: 110 }),
    row('4', '2026-10-27T02:00:00Z', '2026-10-26'),
  ]
  const s = buildSchedule(rows, LAL, now)

  it('orders by tip-off and orients home/away, opponent and result', () => {
    expect(s.map((e) => e.gameId)).toEqual(['1', '2', '3', '4'])
    expect(s[0]).toMatchObject({ homeAway: 'HOME', opponentId: 'OPP', result: 'W', points: 127, oppPoints: 105 })
    expect(s[1]).toMatchObject({ homeAway: 'AWAY', opponentId: 'LAC', result: 'L', points: 110, oppPoints: 117 })
    expect(s[2]).toMatchObject({ state: 'today', result: null, points: null })
  })

  it('counts rest days on the ET calendar and flags back-to-backs', () => {
    expect(s.map((e) => e.restDays)).toEqual([null, 1, 1, 0])
    expect(s.map((e) => e.backToBack)).toEqual([false, false, false, true])
  })

  it('summarizes record and what is left', () => {
    expect(summarizeSchedule(s)).toEqual({
      wins: 1, losses: 1, played: 2, remaining: 2, remainingHome: 1, remainingAway: 1, remainingBackToBacks: 1,
    })
  })
})
