import { describe, it, expect } from 'vitest'
import { SMALL_SAMPLE_MINUTES, groupKey, groupsFromStints, type Stint } from '@/lib/analytics/lineupCombos'
import {
  MISSED_GAMES_SMALL_SAMPLE,
  groupsWithout,
  labHref,
  missedGames,
  starSplit,
  teammateSplits,
  tsPct,
  type FocusGameLog,
} from '@/lib/analytics/starOff'
import type { GameRecord } from '@/lib/analytics/teamProfiles'

const STAR = '1'
const ROSTER = ['1', '2', '3', '4', '5', '6', '7', '8']
const ALL_SIZES = new Set([0, 1, 2, 3, 4, 5])
const name = (id: string) => `P${id}`

function stint(gameId: string, players: string[], minutes: number, pts: number, oppPts: number): Stint {
  const fga = 10, fta = 4, tov = 2, oreb = 2
  return {
    gameId,
    players,
    totals: { minutes, pts, fgm: 4, fga, fg3m: 1, fg3a: 3, ftm: 3, fta, oreb, dreb: 6, ast: 3, tov, stl: 1, blk: 0, plusMinus: pts - oppPts },
    opp: { pts: oppPts, fgm: 4, fga, fg3m: 1, fg3a: 3, ftm: 2, fta, oreb, dreb: 6, tov },
  }
}

// Star plays with 2-5; bench units without him; 6 and 7 play a lot without the star, 8 barely.
const STINTS: Stint[] = [
  stint('g1', ['1', '2', '3', '4', '5'], 120, 300, 260),
  stint('g1', ['2', '3', '6', '7', '8'], 2, 4, 6),
  stint('g2', ['2', '3', '4', '6', '7'], 80, 180, 190),
  stint('g2', ['3', '4', '5', '6', '7'], 60, 150, 140),
  stint('g2', ['1', '2', '6', '7', '5'], 40, 100, 90),
]
const groups = groupsFromStints(STINTS)
const lookup = (k: string) => groups.get(k)

describe('starSplit', () => {
  it('team without the star = team − star, matching the stints he sat out', () => {
    const s = starSplit(lookup, STAR, ALL_SIZES, name, 'Lakers')
    const benchMinutes = STINTS.filter((x) => !x.players.includes(STAR)).reduce((a, x) => a + x.totals.minutes, 0)
    const benchPts = STINTS.filter((x) => !x.players.includes(STAR)).reduce((a, x) => a + x.totals.pts, 0)
    expect(s.off.minutes).toBeCloseTo(benchMinutes)
    expect(s.off.pts).toBe(benchPts)
    expect(s.on.minutes).toBeCloseTo(160)
    expect(s.shareOff).toBeCloseTo(benchMinutes / 302)
    expect(s.off.label).toBe('Lakers, no P1')
    expect(s.tsOff).toBeCloseTo(benchPts / (2 * (3 * 10 + 0.44 * 3 * 4)))
  })

  it('is empty, not zero, when the player-level totals are not loaded', () => {
    const s = starSplit(lookup, STAR, new Set([0]), name)
    expect(s.off.error).toMatch(/aren't loaded/)
    expect(s.off.netRtg).toBeNull()
    expect(s.tsOff).toBeNull()
    expect(s.shareOff).toBeNull()
  })
})

describe('teammateSplits', () => {
  it('splits each teammate into with/without the star and ranks enough-minutes rows by net rating', () => {
    const rows = teammateSplits(lookup, STAR, ROSTER, ALL_SIZES, name)
    expect(rows.find((r) => r.playerId === STAR)).toBeUndefined()
    const p6 = rows.find((r) => r.playerId === '6')!
    expect(p6.without.minutes).toBeCloseTo(142)
    expect(p6.with.minutes).toBeCloseTo(40)
    // P5: never without the star in a big sample (60 min) — P8: 2 minutes → small sample, after full samples
    const p8 = rows.findIndex((r) => r.playerId === '8')
    expect(rows[p8].without.smallSample).toBe(true)
    const full = rows.filter((r) => !r.without.smallSample && !r.without.error)
    expect(rows.slice(0, full.length)).toEqual(full)
    for (let i = 1; i < full.length; i++) expect(full[i - 1].without.netRtg!).toBeGreaterThanOrEqual(full[i].without.netRtg!)
  })

  it('puts a teammate who never played without the star last', () => {
    const only = [stint('g1', ['1', '2', '3', '4', '5'], 100, 200, 190), stint('g1', ['3', '4', '5', '6', '7'], 60, 120, 120)]
    const g = groupsFromStints(only)
    const rows = teammateSplits((k) => g.get(k), STAR, ['2', '3'], ALL_SIZES, name)
    expect(rows.map((r) => r.playerId)).toEqual(['3', '2'])
    expect(rows[1].without.error).toBeTruthy()
  })
})

describe('groupsWithout', () => {
  const refs = [...groups].map(([k, g]) => ({ groupKey: k, groupSize: g.size }))

  it('subtracts the star from pairs and trios and keeps only enough-minute groups', () => {
    const r = groupsWithout(lookup, STAR, refs, ALL_SIZES, name)
    const p67 = r.bestPairs.concat(r.worstPairs).find((x) => groupKey(x.on) === '6-7')!
    expect(p67.minutes).toBeCloseTo(142) // 182 together − 40 with the star
    expect(p67.off).toEqual([STAR])
    for (const x of [...r.bestPairs, ...r.worstPairs, ...r.bestTrios]) {
      expect(x.on).not.toContain(STAR)
      expect(x.minutes!).toBeGreaterThanOrEqual(SMALL_SAMPLE_MINUTES)
    }
    // best and worst never overlap
    const best = new Set(r.bestPairs.map((x) => x.id))
    expect(r.worstPairs.some((x) => best.has(x.id))).toBe(false)
  })

  it('lists five-man lineups without the star by minutes, small ones tagged', () => {
    const r = groupsWithout(lookup, STAR, refs, ALL_SIZES, name)
    expect(r.topFives.map((x) => x.minutes)).toEqual([80, 60, 2])
    expect(r.topFives[2].smallSample).toBe(true)
    expect(r.topFives.every((x) => !x.on.includes(STAR))).toBe(true)
  })
})

describe('labHref', () => {
  it('links pairs with the star off, and fives without it (lab caps at five players)', () => {
    expect(labHref({ on: ['6', '7'], off: ['1'] })).toBe('/lineups?on=6,7&off=1')
    expect(labHref({ on: ['2', '3', '4', '6', '7'], off: ['1'] })).toBe('/lineups?on=2,3,4,6,7')
  })
})

describe('tsPct', () => {
  it('uses 0.44 · FTA and is null with no attempts', () => {
    expect(tsPct({ pts: 22, fga: 15, fta: 5 })).toBeCloseTo(22 / (2 * 17.2))
    expect(tsPct({ pts: 0, fga: 0, fta: 0 })).toBeNull()
  })
})

// ── games missed ─────────────────────────────────────────────────────────────

const TEAM = 'LAL'
function game(id: string, day: number, us: number, them: number): GameRecord {
  const side = (teamId: string, pts: number) => ({ teamId, pts, fgm: 40, fga: 88, fg3m: 12, fg3a: 35, ftm: 15, fta: 20, oreb: 10, dreb: 34, tov: 13 })
  return { gameId: id, gameDate: new Date(2026, 9, day), home: side(TEAM, us), away: side('OPP', them) }
}
function log(gameId: string, playerId: string, minutes: number, extra: Partial<FocusGameLog> = {}): FocusGameLog {
  return { gameId, playerId, minutes, started: false, pts: 10, fgm: 4, fga: 9, fg3m: 1, fg3a: 3, fta: 2, reb: 4, ast: 3, tov: 1, plusMinus: 0, ...extra }
}

describe('missedGames', () => {
  const games = [game('a', 1, 100, 110), game('b', 3, 120, 100), game('c', 5, 105, 100), game('d', 7, 90, 99), game('e', 9, 115, 101)]
  const logs: FocusGameLog[] = [
    // star arrives in game b, sits game d
    log('a', '2', 30), log('b', STAR, 36, { started: true }), log('c', STAR, 34, { started: true }), log('d', STAR, 0), log('e', STAR, 35, { started: true }),
    log('b', '2', 30, { started: true }), log('c', '2', 30, { started: true }), log('d', '2', 36, { started: true, pts: 25, fga: 20, fgm: 9 }), log('e', '2', 31, { started: true }),
    log('b', '3', 20), log('c', '3', 18), log('d', '3', 30, { started: true }), log('e', '3', 20),
  ]

  it('only counts games after the star first played, and splits record by game set', () => {
    const m = missedGames(TEAM, STAR, games, logs)
    expect(m.starPlayed).toBe(true)
    expect(m.gamesBeforeArrival).toBe(1)
    expect(m.withStar).toMatchObject({ games: 3, wins: 3, losses: 0 })
    expect(m.withoutStar).toMatchObject({ games: 1, wins: 0, losses: 1 })
    expect(m.withoutStar.netRtg!).toBeLessThan(0)
    expect(m.smallSample).toBe(1 < MISSED_GAMES_SMALL_SAMPLE)
    expect(m.games.map((g) => g.gameId)).toEqual(['d'])
    expect(m.games[0]).toMatchObject({ teamPts: 90, oppPts: 99, won: false, isHome: true })
  })

  it("gives teammates' per-game lines in each set and flags stand-in starters", () => {
    const m = missedGames(TEAM, STAR, games, logs)
    const p2 = m.teammates.find((t) => t.playerId === '2')!
    expect(p2.gamesWithout).toBe(1)
    expect(p2.gamesWith).toBe(3) // game a is before the star arrived
    expect(p2.without!.pts).toBe(25)
    expect(p2.with!.pts).toBe(10)
    expect(p2.without!.usgPct!).toBeGreaterThan(p2.with!.usgPct!)
    expect(m.standIns[0]).toEqual({ playerId: '3', startsWithout: 1, startRateWith: 0 })
    expect(m.standIns.find((s) => s.playerId === '2')!.startRateWith).toBe(1)
  })

  it('reports a star with no games for the team instead of inventing a split', () => {
    const m = missedGames(TEAM, '99', games, logs)
    expect(m.starPlayed).toBe(false)
    expect(m.withoutStar.games).toBe(0)
    expect(m.teammates).toEqual([])
  })
})
