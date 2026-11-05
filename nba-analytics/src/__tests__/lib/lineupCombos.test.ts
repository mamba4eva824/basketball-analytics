import { describe, it, expect } from 'vitest'
import {
  MAX_COMBO_PLAYERS,
  SMALL_SAMPLE_MINUTES,
  comboLabel,
  comboMetrics,
  comboTotals,
  comparisonPlan,
  comparisonRows,
  groupKey,
  groupsFromStints,
  requiredKeys,
  validateSelection,
  type GroupTotals,
  type Stint,
} from '@/lib/analytics/lineupCombos'

const ROSTER = ['101', '102', '103', '104', '105', '106', '107', '108', '109']
const ALL_SIZES = new Set([0, 1, 2, 3, 4, 5])

/** Deterministic pseudo-random stints (mulberry32) so failures reproduce. */
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomStints(n: number, seed = 7): Stint[] {
  const r = rng(seed)
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1))
  return Array.from({ length: n }, (_, i) => {
    const pool = [...ROSTER]
    const players = Array.from({ length: 5 }, () => pool.splice(int(0, pool.length - 1), 1)[0])
    const fga = int(2, 12)
    const fgm = int(0, fga)
    const fg3a = int(0, fga)
    const fg3m = int(0, Math.min(fg3a, fgm))
    const fta = int(0, 6)
    const ftm = int(0, fta)
    const pts = 2 * (fgm - fg3m) + 3 * fg3m + ftm
    const ofga = int(2, 12)
    const ofgm = int(0, ofga)
    const ofg3m = int(0, ofgm)
    const ofta = int(0, 6)
    const oftm = int(0, ofta)
    const oppPts = 2 * (ofgm - ofg3m) + 3 * ofg3m + oftm
    return {
      gameId: `g${i % 6}`,
      players,
      totals: {
        minutes: int(1, 9) + r(), pts, fgm, fga, fg3m, fg3a: Math.max(fg3a, fg3m), ftm, fta,
        oreb: int(0, 3), dreb: int(1, 6), ast: int(0, fgm), tov: int(0, 3), stl: int(0, 2), blk: int(0, 2), plusMinus: pts - oppPts,
      },
      opp: { pts: oppPts, fgm: ofgm, fga: ofga, fg3m: ofg3m, fg3a: ofg3m + int(0, 3), ftm: oftm, fta: ofta, oreb: int(0, 3), dreb: int(1, 6), tov: int(0, 3) },
    }
  })
}

/** Brute force: sum the stints with everyone in `on` playing and nobody in `off`. */
function direct(stints: Stint[], on: string[], off: string[]) {
  const hit = stints.filter((s) => on.every((p) => s.players.includes(p)) && off.every((p) => !s.players.includes(p)))
  return {
    minutes: hit.reduce((a, s) => a + s.totals.minutes, 0),
    pts: hit.reduce((a, s) => a + s.totals.pts, 0),
    plusMinus: hit.reduce((a, s) => a + s.totals.plusMinus, 0),
    fga: hit.reduce((a, s) => a + s.totals.fga, 0),
    oppFga: hit.reduce((a, s) => a + s.opp.fga, 0),
    oppDreb: hit.reduce((a, s) => a + s.opp.dreb, 0),
  }
}

const stints = randomStints(400)
const groups = groupsFromStints(stints)
const lookup = (k: string) => groups.get(k)

describe('groupsFromStints', () => {
  it('builds the team, every player and every 2–5-man subset with games played', () => {
    const team = groups.get('')!
    expect(team.size).toBe(0)
    expect(team.minutes).toBeCloseTo(stints.reduce((a, s) => a + s.totals.minutes, 0), 6)
    expect(team.gamesPlayed).toBe(6)
    const five = groupKey(stints[0].players)
    expect(groups.get(five)!.size).toBe(5)
    // each stint contributes 2^5 = 32 subsets; no group is bigger than five
    expect(Math.max(...[...groups.values()].map((g) => g.size))).toBe(5)
  })
})

describe('comboTotals (inclusion–exclusion)', () => {
  const cases: [string[], string[]][] = [
    [['101', '102'], []],
    [['101', '102', '103'], []],
    [['101', '103'], ['102']],
    [['101'], ['102', '103']],
    [[], ['101']],
    [[], ['101', '102', '103', '104', '105']],
    [['104', '105', '106'], ['101', '102']],
    [['101', '102', '103', '104', '105'], []],
  ]
  it.each(cases)('on %j off %j matches a brute-force count', (on, off) => {
    const want = direct(stints, on, off)
    const { totals, error } = comboTotals(lookup, on, off, ALL_SIZES)
    if (want.minutes === 0) {
      expect(error).toMatch(/Never on the floor/)
      return
    }
    expect(error).toBeNull()
    expect(totals!.minutes).toBeCloseTo(want.minutes, 6)
    expect(totals!.pts).toBe(want.pts)
    expect(totals!.plusMinus).toBe(want.plusMinus)
    expect(totals!.fga).toBe(want.fga)
    expect(totals!.opp!.fga).toBe(want.oppFga)
    expect(totals!.opp!.dreb).toBe(want.oppDreb)
  })

  it('treats a group NBA.com never listed as zero minutes together', () => {
    const tiny = groupsFromStints([stints[0]])
    const [a, b] = stints[0].players
    const outsider = ROSTER.find((p) => !stints[0].players.includes(p))!
    // a + b without outsider = a + b (outsider never shared the floor with them)
    const { totals } = comboTotals((k) => tiny.get(k), [a, b], [outsider], ALL_SIZES)
    expect(totals!.minutes).toBeCloseTo(stints[0].totals.minutes, 6)
    expect(comboTotals((k) => tiny.get(k), [a, outsider], [], ALL_SIZES).error).toMatch(/Never on the floor/)
  })

  it('refuses when a needed group size is not loaded, instead of assuming zero', () => {
    const { totals, error } = comboTotals(lookup, ['101', '102'], ['103'], new Set([0, 1, 2]))
    expect(totals).toBeNull()
    expect(error).toMatch(/3-man groups aren't loaded/)
  })

  it('drops opponent totals if any term lacks them', () => {
    const noOpp = new Map([...groups].map(([k, g]) => [k, k === groupKey(['101', '102', '103']) ? { ...g, opp: null } : g]))
    const { totals } = comboTotals((k) => noOpp.get(k), ['101', '102'], ['103'], ALL_SIZES)
    expect(totals!.opp).toBeNull()
    expect(comboMetrics(totals!).orebPct).toBeNull()
  })

  it('reports games played only for a group straight from NBA.com', () => {
    expect(comboTotals(lookup, ['101', '102'], [], ALL_SIZES).totals!.gamesPlayed).toBe(groups.get(groupKey(['101', '102']))!.gamesPlayed)
    const rows = comparisonRows(lookup, ['101', '102'], ['103'], ALL_SIZES, (id) => id)
    expect(rows[0].gamesPlayed).toBeNull()
  })
})

describe('validateSelection', () => {
  it('caps on + off at five and rejects overlaps and duplicates', () => {
    expect(validateSelection(['1', '2', '3'], ['4', '5'])).toBeNull()
    expect(validateSelection(['1', '2', '3'], ['4', '5', '6'])).toMatch(`at most ${MAX_COMBO_PLAYERS}`)
    expect(validateSelection(['1'], ['1'])).toMatch(/both on and off/)
    expect(validateSelection(['1', '1'], [])).toMatch(/twice/)
  })
  it('needs 2^|off| groups', () => {
    expect(requiredKeys(['1', '2'], ['3', '4']).sort()).toEqual(['1-2', '1-2-3', '1-2-3-4', '1-2-4'].sort())
  })
})

describe('comboMetrics', () => {
  const t: GroupTotals = {
    gamesPlayed: 3, minutes: 96, pts: 220, fgm: 80, fga: 170, fg3m: 25, fg3a: 70, ftm: 35, fta: 45,
    oreb: 20, dreb: 70, ast: 50, tov: 25, stl: 10, blk: 8, plusMinus: 20,
    opp: { pts: 200, fgm: 75, fga: 175, fg3m: 20, fg3a: 60, ftm: 30, fta: 40, oreb: 22, dreb: 65, tov: 28 },
  }
  it('uses the season box-score formulas over the lineup minutes', () => {
    const m = comboMetrics(t)
    const own = 170 + 0.44 * 45 - 20 + 25
    const opp = 175 + 0.44 * 40 - 22 + 28
    const poss = (own + opp) / 2
    expect(m.poss).toBeCloseTo(poss, 9)
    expect(m.offRtg).toBeCloseTo((100 * 220) / poss, 9)
    expect(m.defRtg).toBeCloseTo((100 * 200) / poss, 9) // opp points = pts − plus/minus
    expect(m.netRtg).toBeCloseTo(m.offRtg! - m.defRtg!, 9)
    expect(m.pace).toBeCloseTo((poss * 48) / 96, 9)
    expect(m.efgPct).toBeCloseTo((80 + 12.5) / 170, 9)
    expect(m.orebPct).toBeCloseTo(20 / (20 + 65), 9)
    expect(m.oppOrebPct).toBeCloseTo(22 / (22 + 70), 9)
    expect(m.tovPct).toBeCloseTo(25 / (170 + 0.44 * 45 + 25), 9)
  })
  it('falls back to one-sided possessions without opponent totals', () => {
    const m = comboMetrics({ ...t, opp: null })
    expect(m.poss).toBeCloseTo(170 + 0.44 * 45 - 20 + 25, 9)
    expect(m.oppEfgPct).toBeNull()
  })
})

describe('comparison rows', () => {
  it('plans the selection, each player either way and off the floor, then the team', () => {
    const plan = comparisonPlan(['D', 'R', 'K'], [])
    expect(plan.map((p) => [p.kind, p.on.join('+'), p.off.join('+')])).toEqual([
      ['selection', 'D+R+K', ''],
      ['any', 'R+K', ''],
      ['without', 'R+K', 'D'],
      ['any', 'D+K', ''],
      ['without', 'D+K', 'R'],
      ['any', 'D+R', ''],
      ['without', 'D+R', 'K'],
      ['team', '', ''],
    ])
  })
  it('names the player each comparison takes out', () => {
    expect(comparisonPlan(['D', 'R', 'K'], []).map((p) => p.removed)).toEqual([null, 'D', 'D', 'R', 'R', 'K', 'K', null])
  })
  it('one player: on vs the team without them', () => {
    expect(comparisonPlan(['D'], []).map((p) => p.kind)).toEqual(['selection', 'without', 'team'])
  })
  it('labels rows readably', () => {
    const name = (id: string) => ({ D: 'Dončić', R: 'Reaves', K: 'Kessler' })[id] ?? id
    expect(comboLabel(['D', 'K'], ['R'], name)).toBe('Dončić + Kessler, no Reaves')
    expect(comboLabel([], ['D'], name, 'Lakers')).toBe('Lakers, no Dončić')
    expect(comboLabel([], [], name, 'Lakers')).toBe('Lakers, all minutes')
  })
  it('flags small samples by minutes', () => {
    const rows = comparisonRows(lookup, ['101', '102', '103', '104', '105'], [], ALL_SIZES, (id) => id)
    const sel = rows[0]
    if (sel.minutes != null) expect(sel.smallSample).toBe(sel.minutes < SMALL_SAMPLE_MINUTES)
    expect(rows.at(-1)!.kind).toBe('team')
    expect(rows.at(-1)!.smallSample).toBe(false)
  })
})
