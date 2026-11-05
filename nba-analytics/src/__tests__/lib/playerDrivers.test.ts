import { describe, it, expect } from 'vitest'
import { boxDrivers, onOffDrivers, unattributedShare, DRIVER_FOR, type PlayerLog, type TeamGameTotals } from '@/lib/analytics/playerDrivers'
import { groupsFromStints, type Stint } from '@/lib/analytics/lineupCombos'

const day = (d: number) => new Date(Date.UTC(2026, 9, 21 + d))

/** 20 games. A: 30 min, 3 TOV a game for 10 games, then 1. B: 20 min, 1 TOV. C: 10 min in the first 3 games only. Team adds 1 team TOV a game. */
function fixture() {
  const team: TeamGameTotals[] = []
  const logs: PlayerLog[] = []
  for (let i = 0; i < 20; i++) {
    const gameId = `G${i}`
    const a = i < 10 ? 3 : 1
    logs.push({ playerId: 'A', gameId, gameDate: day(i), minutes: 30, tov: a, oreb: 2, dreb: 5 })
    logs.push({ playerId: 'B', gameId, gameDate: day(i), minutes: 20, tov: 1, oreb: 1, dreb: 3 })
    if (i < 3) logs.push({ playerId: 'C', gameId, gameDate: day(i), minutes: 10, tov: 0, oreb: 1, dreb: 1 })
    logs.push({ playerId: 'D', gameId, gameDate: day(i), minutes: 0, tov: 0, oreb: 0, dreb: 0 }) // DNP
    team.push({ gameId, gameDate: day(i), tov: a + 1 + 1, oreb: 3 + (i < 3 ? 1 : 0), dreb: 8 + (i < 3 ? 1 : 0) })
  }
  return { team, logs }
}

describe('boxDrivers', () => {
  const { team, logs } = fixture()
  const tov = boxDrivers(logs, team, 'tov')

  it('lists players with minutes, biggest share first', () => {
    expect(tov.map((d) => d.playerId)).toEqual(['A', 'B', 'C'])
  })

  it('computes per 36 and share over the season', () => {
    const a = tov[0]
    // 10×3 + 10×1 = 40 TOV in 600 min; team 40 + 20 + 20 = 80
    expect(a.season).toMatchObject({ games: 20, minutes: 600, total: 40, smallSample: false })
    expect(a.season.per36).toBeCloseTo(40 * 36 / 600, 9)
    expect(a.season.share).toBeCloseTo(40 / 80, 9)
  })

  it('uses the team\'s last 10 games for "recent" and flags the trend in the right direction', () => {
    const a = tov[0]
    expect(a.recent).toMatchObject({ games: 10, minutes: 300, total: 10 })
    expect(a.recent.share).toBeCloseTo(10 / 30, 9) // team: 10 games × (1 + 1 + 1)
    expect(a.trend).toBe('improving') // fewer turnovers per 36 lately
    expect(tov[1].trend).toBe('steady')
  })

  it('flags small samples and gives no trend without recent games', () => {
    const c = tov[2]
    expect(c.season).toMatchObject({ games: 3, minutes: 30, smallSample: true })
    expect(c.recent.games).toBe(0)
    expect(c.trend).toBeNull()
  })

  it('reports the share charged to no player (team turnovers), negative when logs and box scores disagree', () => {
    expect(unattributedShare(tov)).toBeCloseTo(20 / 80, 9)
    expect(unattributedShare(boxDrivers(logs, team, 'oreb'))).toBeCloseTo(0, 9)
    const stale = team.map((g) => ({ ...g, oreb: g.oreb! - 1 })) // box scores short by 1 a game
    expect(unattributedShare(boxDrivers(logs, stale, 'oreb'))!).toBeLessThan(0)
  })

  it('a rising rebound rate is "improving" (higher is better), and missing team totals give no share', () => {
    const { team: t, logs: l } = fixture()
    const up = l.map((x) => (x.playerId === 'B' && x.gameDate >= day(10) ? { ...x, oreb: 3 } : x))
    expect(boxDrivers(up, t, 'oreb').find((d) => d.playerId === 'B')!.trend).toBe('improving')
    const noReb = t.map((g, i) => (i === 0 ? { ...g, oreb: null } : g))
    expect(boxDrivers(l, noReb, 'oreb')[0].season.share).toBeNull()
  })

  it('ignores logs from games that aren\'t the team\'s', () => {
    const extra: PlayerLog[] = [...logs, { playerId: 'A', gameId: 'OTHER', gameDate: day(30), minutes: 40, tov: 9, oreb: 0, dreb: 0 }]
    expect(boxDrivers(extra, team, 'tov')[0].season.total).toBe(40)
  })
})

describe('onOffDrivers', () => {
  // three stints: P on for 30 min (+10), P off for 20 min (−5), 10 min with Q on and P off (+3)
  const base = { fgm: 10, fga: 22, fg3m: 3, fg3a: 9, ftm: 4, fta: 5, oreb: 3, dreb: 9, ast: 6, tov: 3, stl: 2, blk: 1 }
  const opp = { fgm: 9, fga: 22, fg3m: 2, fg3a: 8, ftm: 3, fta: 4, oreb: 3, dreb: 9, tov: 4 }
  const stint = (players: string[], minutes: number, pts: number, oppPts: number): Stint => ({
    gameId: 'g1', players, totals: { ...base, minutes, pts, plusMinus: pts - oppPts }, opp: { ...opp, pts: oppPts },
  })
  const groups = groupsFromStints([
    stint(['P', 'Q', 'R', 'S', 'T'], 30, 70, 60),
    stint(['Q', 'R', 'S', 'T', 'U'], 20, 40, 45),
    stint(['Q', 'R', 'S', 'U', 'V'], 10, 30, 27),
  ])
  const sizes = new Set([0, 1, 2, 3, 4, 5])
  const lookup = (k: string) => groups.get(k)

  it('signs impact so positive is always better for the team', () => {
    const { netRtg: net, defRtg: def } = onOffDrivers(['P', 'U'], lookup, sizes)
    const p = net.find((d) => d.playerId === 'P')!
    expect(p.minutesOn).toBeCloseTo(30, 9)
    expect(p.minutesOff).toBeCloseTo(30, 9)
    expect(p.impact).toBeCloseTo(p.on! - p.off!, 9)
    const pd = def.find((d) => d.playerId === 'P')!
    expect(pd.impact).toBeCloseTo(-(pd.on! - pd.off!), 9) // lower DRtg is better
    expect(net[0].impact!).toBeGreaterThanOrEqual(net[1].impact!) // best first
  })

  it('says "never off the floor" (not "never on") when a player played every minute', () => {
    const [q] = onOffDrivers(['Q'], lookup, sizes).netRtg
    expect(q.impact).toBeNull()
    expect(q.minutesOn).toBeCloseTo(60, 9)
    expect(q.error).toMatch(/^Never off the floor/)
  })

  it('computes all three ratings from the same on/off rows', () => {
    const all = onOffDrivers(['P'], lookup, sizes)
    const [n, o, d] = [all.netRtg[0], all.offRtg[0], all.defRtg[0]]
    expect(n.on).toBeCloseTo(o.on! - d.on!, 9)
    expect(n.off).toBeCloseTo(o.off! - d.off!, 9)
  })

  it('maps each focus metric to its driver', () => {
    expect(DRIVER_FOR.tovPct).toEqual({ kind: 'box', stat: 'tov' })
    expect(DRIVER_FOR.oppOrebPct).toEqual({ kind: 'box', stat: 'dreb' })
    expect(DRIVER_FOR.defRtg).toEqual({ kind: 'onoff', stat: 'defRtg' })
    expect(DRIVER_FOR.pace).toBeUndefined()
  })
})
