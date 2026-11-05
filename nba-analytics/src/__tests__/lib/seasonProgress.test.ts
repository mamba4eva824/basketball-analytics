import { describe, it, expect } from 'vitest'
import { buildTeamProfiles, type BoxSide, type GameRecord } from '@/lib/analytics/teamProfiles'
import { rankProfiles } from '@/lib/analytics/ranks'
import {
  FOCUS_DEFAULT,
  MOVER_LOOKBACK,
  RECENT_GAMES,
  SEGMENT_GAMES,
  leagueValues,
  seasonProgress,
  trendVerdict,
} from '@/lib/analytics/seasonProgress'

const US = 'LAL'
const OTHERS = ['BOS', 'GSW', 'DEN', 'MIA', 'NYK']

/** Deterministic box score; `edge` tilts the side's shooting and turnovers. */
function side(teamId: string, seed: number, edge = 0): BoxSide {
  const fga = 85 + (seed % 7)
  const fgm = Math.round(fga * (0.45 + edge * 0.01 + ((seed * 37) % 11) / 300))
  const fg3a = 30 + (seed % 9)
  const fg3m = Math.min(fgm, Math.round(fg3a * (0.33 + ((seed * 13) % 7) / 100)))
  const fta = 18 + (seed % 8)
  const ftm = Math.round(fta * 0.78)
  return {
    teamId, fga, fgm, fg3a, fg3m, fta, ftm,
    pts: 2 * (fgm - fg3m) + 3 * fg3m + ftm,
    oreb: 9 + ((seed * 5) % 6), dreb: 32 + ((seed * 3) % 7), tov: Math.max(6, 15 - edge - (seed % 5)),
  }
}

const day = (d: number) => new Date(Date.UTC(2026, 9, 21 + d))

/** 40 days: we play every day (improving as the season goes on); the other five play each other. */
function season(): GameRecord[] {
  const games: GameRecord[] = []
  for (let d = 0; d < 40; d++) {
    const opp = OTHERS[d % OTHERS.length]
    const edge = Math.floor(d / 10) // better every 10 games
    games.push({ gameId: `L${d}`, gameDate: day(d), home: side(US, d, edge), away: side(opp, d + 100) })
    const [a, b] = [OTHERS[(d + 1) % 5], OTHERS[(d + 3) % 5]]
    games.push({ gameId: `X${d}`, gameDate: day(d), home: side(a, d + 200), away: side(b, d + 300) })
  }
  return games
}

const games = season()
const p = seasonProgress(games, US)

describe('leagueValues', () => {
  it('pools every side of every game: net 0, ORtg = DRtg, eFG over all shots', () => {
    const lg = leagueValues(games)
    expect(lg.netRtg).toBeCloseTo(0, 9)
    expect(lg.offRtg).toBeCloseTo(lg.defRtg!, 9)
    const sides = games.flatMap((g) => [g.home, g.away])
    const sum = (k: keyof BoxSide) => sides.reduce((s, x) => s + (x[k] as number), 0)
    expect(lg.efgPct).toBeCloseTo((sum('fgm') + 0.5 * sum('fg3m')) / sum('fga'), 9)
    expect(lg.orebPct).toBeCloseTo(sum('oreb') / (sum('oreb') + sum('dreb')), 9)
    expect(lg.oppOrebPct).toBeCloseTo(lg.orebPct!, 9)
    expect(lg.ppg).toBeCloseTo(sum('pts') / sides.length, 9)
  })
})

describe('trendVerdict', () => {
  it('respects direction and the minimum change', () => {
    expect(trendVerdict('tovPct', 0.12, 0.14)).toBe('improving') // fewer turnovers
    expect(trendVerdict('tovPct', 0.145, 0.14)).toBe('steady') // half a point: noise
    expect(trendVerdict('oppOrebPct', 0.30, 0.27)).toBe('slipping') // allowing more boards
    expect(trendVerdict('defRtg', 108, 112)).toBe('improving')
    expect(trendVerdict('netRtg', 1, 4)).toBe('slipping')
    expect(trendVerdict('pace', 104, 98)).toBeNull() // style
    expect(trendVerdict('orebPct', null, 0.25)).toBeNull()
  })
})

describe('seasonProgress', () => {
  it('defaults to the five focus areas', () => {
    expect(FOCUS_DEFAULT).toEqual(['tovPct', 'orebPct', 'oppOrebPct', 'defRtg', 'netRtg'])
  })

  it('has one point per game, ranked against every team through that day', () => {
    expect(p.games).toBe(40)
    expect(p.history.map((h) => h.gameNo)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1))
    for (const i of [0, 9, 25, 39]) {
      const h = p.history[i]
      const through = games.filter((g) => g.gameDate <= h.gameDate)
      const profiles = buildTeamProfiles(through)
      expect(h.toDate.tovPct).toBeCloseTo(profiles.get(US)!.tovPct!, 12)
      expect(h.rank).toEqual(rankProfiles(profiles.values()).get(US))
      expect(h.rankedTeams).toBe(profiles.size)
      expect(h.league.efgPct).toBeCloseTo(leagueValues(through).efgPct!, 12)
    }
  })

  it('uses the last 10 games for "recent", and the season for the card', () => {
    const last = p.history.at(-1)!
    const ours = games.filter((g) => g.home.teamId === US)
    expect(last.recent.tovPct).toBeCloseTo(buildTeamProfiles(ours.slice(-RECENT_GAMES)).get(US)!.tovPct!, 12)
    expect(p.cards.tovPct.season).toBe(last.toDate.tovPct)
    expect(p.cards.tovPct.recent).toBe(last.recent.tovPct)
    // turnovers fall every 10 games, so the last 10 beat the season
    expect(p.cards.tovPct.trend).toBe('improving')
  })

  it('splits into 10-game blocks and months that add back to the season', () => {
    expect(p.blocks.map((b) => [b.label, b.games])).toEqual([['Games 1–10', 10], ['Games 11–20', 10], ['Games 21–30', 10], ['Games 31–40', 10]])
    expect(p.blocks.reduce((s, b) => s + b.games, 0)).toBe(40)
    expect(p.months.map((m) => [m.label, m.games])).toEqual([['October 2026', 11], ['November 2026', 29]])
    expect(p.blocks[0].values.tovPct).toBeGreaterThan(p.blocks[3].values.tovPct!) // the improvement shows
    expect(p.blocks.every((b) => !b.smallSample)).toBe(true)
    expect(SEGMENT_GAMES).toBe(10)
  })

  it('measures rank changes over the last 15 games once there are enough', () => {
    expect(p.moversSince).toBe(40 - MOVER_LOOKBACK)
    const then = p.history[40 - MOVER_LOOKBACK - 1]
    for (const m of FOCUS_DEFAULT) {
      const now = p.history.at(-1)!.rank[m]
      expect(p.cards[m].rankChange).toBe(then.rank[m] != null && now != null ? then.rank[m]! - now : null)
    }
    for (const r of p.risers) expect(r.change!).toBeGreaterThanOrEqual(3)
    for (const f of p.fallers) expect(f.change!).toBeLessThanOrEqual(-3)
  })

  it('early in the season compares with game 5, and has no baseline before game 6', () => {
    const early = (n: number) => seasonProgress(games.filter((g) => g.gameDate < day(n)), US)
    expect(early(9).moversSince).toBe(5)
    expect(early(5).moversSince).toBeNull()
    expect(early(5).risers).toEqual([])
    expect(early(5).cards.netRtg.rankChange).toBeNull()
  })

  it('lists strengths in the top third and weaknesses in the bottom third, quality metrics only', () => {
    const third = Math.ceil(p.rankedTeams / 3)
    for (const s of p.strengths) expect(s.rank).toBeLessThanOrEqual(third)
    for (const w of p.weaknesses) expect(w.rank).toBeGreaterThan(p.rankedTeams - third)
    const listed = [...p.strengths, ...p.weaknesses, ...p.risers, ...p.fallers].map((x) => x.metric)
    for (const style of ['pace', 'threePaRate', 'ppg', 'oppPpg']) expect(listed).not.toContain(style)
  })

  it('handles a team with no games', () => {
    const none = seasonProgress(games, 'SAC')
    expect(none.games).toBe(0)
    expect(none.history).toEqual([])
    expect(none.cards.netRtg).toMatchObject({ season: null, rank: null, trend: null, rankChange: null })
    expect(none.strengths).toEqual([])
  })
})
