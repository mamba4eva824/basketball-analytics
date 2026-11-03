import { describe, it, expect } from 'vitest'
import { playerMetricValues, playerTrend, type PlayerGameInput } from '@/lib/analytics/playerTrend'

const game = (day: number, o: Partial<PlayerGameInput> = {}): PlayerGameInput => ({
  gameId: `g${day}`,
  gameDate: new Date(Date.UTC(2026, 9, day)),
  opponentId: 'opp',
  won: true,
  min: 30,
  pts: 20,
  fgm: 7,
  fga: 15,
  fg3m: 2,
  fg3a: 6,
  fta: 5,
  reb: 6,
  ast: 5,
  tov: 3,
  plusMinus: 4,
  team: { fga: 88, fta: 22, tov: 14, min: 240 },
  ...o,
})

describe('playerMetricValues', () => {
  it('computes shooting and usage from box-score totals', () => {
    const v = playerMetricValues([game(21)])
    expect(v.tsPct).toBeCloseTo(20 / (2 * (15 + 0.44 * 5)), 6)
    expect(v.efgPct).toBeCloseTo((7 + 1) / 15, 6)
    expect(v.threePaRate).toBeCloseTo(6 / 15, 6)
    expect(v.ftRate).toBeCloseTo(5 / 15, 6)
    // (15 + 2.2 + 3) * (240 / 5) / (30 * (88 + 9.68 + 14))
    expect(v.usgPct).toBeCloseTo((20.2 * 48) / (30 * 111.68), 6)
    expect(v).toMatchObject({ pts: 20, min: 30, ast: 5, reb: 6, tov: 3, plusMinus: 4 })
  })

  it('adds totals before dividing, never averages percentages', () => {
    const v = playerMetricValues([game(21, { fgm: 1, fg3m: 0, fga: 2 }), game(23, { fgm: 9, fg3m: 0, fga: 18 })])
    expect(v.efgPct).toBeCloseTo(10 / 20, 6)
    expect(v.pts).toBe(20)
  })

  it('handles overtime through team minutes', () => {
    const reg = playerMetricValues([game(21)]).usgPct!
    const ot = playerMetricValues([game(21, { team: { fga: 88, fta: 22, tov: 14, min: 265 } })]).usgPct!
    expect(ot / reg).toBeCloseTo(265 / 240, 6)
  })

  it('returns null rather than inventing a rate with no attempts', () => {
    const v = playerMetricValues([game(21, { pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, fta: 0, plusMinus: null })])
    expect(v.tsPct).toBeNull()
    expect(v.efgPct).toBeNull()
    expect(v.threePaRate).toBeNull()
    expect(v.plusMinus).toBeNull()
  })

  it('is all null with no games', () => {
    expect(Object.values(playerMetricValues([])).every((x) => x === null)).toBe(true)
  })
})

describe('playerTrend', () => {
  it('orders games, skips games without minutes, and rolls a window', () => {
    const t = playerTrend([game(27, { pts: 30 }), game(21, { pts: 10 }), game(25, { min: 0, pts: 0 }), game(23, { pts: 20 })], 2)
    expect(t.map((g) => g.gameId)).toEqual(['g21', 'g23', 'g27'])
    expect(t.map((g) => g.game.pts)).toEqual([10, 20, 30])
    expect(t.map((g) => g.rolling.pts)).toEqual([10, 15, 25])
    expect(t.map((g) => g.toDate.pts)).toEqual([10, 15, 20])
  })
})
