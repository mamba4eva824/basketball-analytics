import { describe, it, expect } from 'vitest'
import { metricTrend } from '@/lib/analytics/metricTrend'
import type { BoxSide, GameRecord } from '@/lib/analytics/teamProfiles'

const LAL = 'LAL'

function side(teamId: string, o: Partial<BoxSide> = {}): BoxSide {
  return { teamId, pts: 110, fgm: 40, fga: 80, fg3m: 12, fg3a: 35, ftm: 18, fta: 25, oreb: 10, dreb: 33, tov: 10, ...o }
}

function game(id: string, date: string, us: Partial<BoxSide>, home = true): GameRecord {
  const mine = side(LAL, us)
  const opp = side(`OPP${id}`, { pts: 100 })
  return { gameId: id, gameDate: new Date(date), home: home ? mine : opp, away: home ? opp : mine }
}

// TOV% = TOV / (FGA + 0.44·FTA + TOV); with FGA 80, FTA 25 → plays = 91 + TOV
const games = [
  game('3', '2026-10-25', { tov: 10 }, false),
  game('1', '2026-10-21', { tov: 20 }),
  game('2', '2026-10-23', { tov: 15, pts: 90 }),
]

describe('metricTrend', () => {
  const t = metricTrend(games, LAL, 2)

  it('orders games oldest first and orients home/away', () => {
    expect(t.map((g) => g.gameId)).toEqual(['1', '2', '3'])
    expect(t.map((g) => g.won)).toEqual([true, false, true])
    expect(t[2].opponentId).toBe('OPP3')
  })

  it('computes the single-game value', () => {
    expect(t[0].game.tovPct).toBeCloseTo(20 / 111)
    expect(t[2].game.tovPct).toBeCloseTo(10 / 101)
  })

  it('aggregates the rolling window and season to date from totals, not by averaging ratios', () => {
    expect(t[2].rolling.tovPct).toBeCloseTo((15 + 10) / (106 + 101))
    expect(t[2].toDate.tovPct).toBeCloseTo((20 + 15 + 10) / (111 + 106 + 101))
    expect(t[0].rolling.tovPct).toBeCloseTo(t[0].game.tovPct!)
  })

  it('returns no games for a team that has not played', () => {
    expect(metricTrend(games, 'NOPE')).toEqual([])
  })
})
