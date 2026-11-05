import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { scoringEvents, type RawLiveAction, type RawLiveBoxScore } from '@/lib/analytics/live'
import {
  buildCheckpointReports,
  foulTroubleAt,
  keyChecks,
  reachedMarks,
  reportMarks,
  runsEndingIn,
  stretchBox,
  type SeasonFactors,
} from '@/lib/analytics/ingameReport'
import { reportKeys } from '@/lib/reportNames'

let order = 0
function act(o: Partial<RawLiveAction>): RawLiveAction {
  order += 1
  return { actionNumber: order, orderNumber: order, period: 1, clock: 'PT12M00.00S', actionType: 'period', ...o }
}

describe('checkpoint marks', () => {
  it('reports twice a period: 6:00 and the end, 2:30 and the end in overtime', () => {
    const marks = reportMarks(5)
    expect(marks.map((m) => m.label)).toEqual([
      'Q1 6:00', 'End of Q1', 'Q2 6:00', 'End of Q2', 'Q3 6:00', 'End of Q3', 'Q4 6:00', 'End of Q4', 'OT 2:30', 'End of OT',
    ])
    expect(marks.map((m) => m.elapsed)).toEqual([360, 720, 1080, 1440, 1800, 2160, 2520, 2880, 3030, 3180])
    expect(marks[8].id).toBe('ot1-mid')
  })

  it('knows which marks are reached and the next one', () => {
    const { reached, next } = reachedMarks(1100, 2)
    expect(reached.map((m) => m.id)).toEqual(['q1-mid', 'q1-end', 'q2-mid'])
    expect(next?.id).toBe('q2-end')
    expect(reachedMarks(360, 1).reached.map((m) => m.id)).toEqual(['q1-mid']) // exactly on the mark
    expect(reachedMarks(2880, 4).next).toBeNull() // end of regulation: nothing scheduled until OT starts
    expect(reachedMarks(2900, 5).next?.id).toBe('ot1-mid')
  })
})

describe('stretch box score (synthetic)', () => {
  // HOM (focus) vs AWY. Q1: HOM 3 made with assist, AWY miss + OREB + made 2, HOM turnover (steal), foul, FTs
  order = 0
  const plays: RawLiveAction[] = [
    act({ actionType: 'period', scoreHome: '0', scoreAway: '0' }),
    act({ clock: 'PT11M30.00S', teamTricode: 'HOM', actionType: '3pt', personId: 1, playerNameI: 'A. One', shotResult: 'Made', assistPersonId: 2, assistPlayerNameInitial: 'B. Two', scoreHome: '3', scoreAway: '0' }),
    act({ clock: 'PT11M00.00S', teamTricode: 'AWY', actionType: '2pt', personId: 9, playerNameI: 'Z. Nine', shotResult: 'Missed', blockPersonId: 2, blockPlayerName: 'Two', scoreHome: '3', scoreAway: '0' }),
    act({ clock: 'PT10M58.00S', teamTricode: 'AWY', actionType: 'rebound', subType: 'offensive', personId: 8, playerNameI: 'Y. Eight', scoreHome: '3', scoreAway: '0' }),
    act({ clock: 'PT10M55.00S', teamTricode: 'AWY', actionType: '2pt', personId: 8, playerNameI: 'Y. Eight', shotResult: 'Made', scoreHome: '3', scoreAway: '2' }),
    act({ clock: 'PT10M30.00S', teamTricode: 'HOM', actionType: 'turnover', personId: 1, playerNameI: 'A. One', stealPersonId: 9, stealPlayerName: 'Nine', scoreHome: '3', scoreAway: '2' }),
    act({ clock: 'PT10M20.00S', teamTricode: 'HOM', actionType: 'foul', subType: 'personal', personId: 2, playerNameI: 'B. Two', scoreHome: '3', scoreAway: '2' }),
    act({ clock: 'PT10M20.00S', teamTricode: 'AWY', actionType: 'freethrow', personId: 9, playerNameI: 'Z. Nine', shotResult: 'Made', scoreHome: '3', scoreAway: '3' }),
    act({ clock: 'PT10M20.00S', teamTricode: 'AWY', actionType: 'freethrow', personId: 9, playerNameI: 'Z. Nine', shotResult: 'Missed', scoreHome: '3', scoreAway: '3' }),
    act({ clock: 'PT10M18.00S', teamTricode: 'HOM', actionType: 'rebound', subType: 'defensive', personId: 1, playerNameI: 'A. One', scoreHome: '3', scoreAway: '3' }),
    // team rebound and technical: not counted in OREB/DREB or personal fouls
    act({ clock: 'PT09M00.00S', teamTricode: 'HOM', actionType: 'rebound', subType: 'defensive', qualifiers: ['team'], scoreHome: '3', scoreAway: '3' }),
    act({ clock: 'PT08M00.00S', teamTricode: 'AWY', actionType: 'foul', subType: 'technical', personId: 9, scoreHome: '3', scoreAway: '3' }),
    // an end-of-quarter heave isn't a field-goal attempt
    act({ clock: 'PT00M00.50S', teamTricode: 'AWY', actionType: 'heave', personId: 9, scoreHome: '3', scoreAway: '3' }),
    // after Q1 6:00
    act({ clock: 'PT05M00.00S', teamTricode: 'HOM', actionType: '2pt', personId: 1, playerNameI: 'A. One', shotResult: 'Made', scoreHome: '5', scoreAway: '3' }),
  ]
  const events = scoringEvents(plays)
  const ctx = { focus: { tricode: 'HOM', isHome: true }, opp: { tricode: 'AWY' }, names: new Map([['1', 'Alpha One']]) }

  it('counts both sides from the play-by-play, points from the score', () => {
    const s = stretchBox(plays, events, -1, 360, ctx)
    expect(s.focus).toMatchObject({ pts: 3, fgm: 1, fga: 1, fg3m: 1, fg3a: 1, ast: 1, blk: 1, tov: 1, pf: 1, dreb: 1, oreb: 0 })
    expect(s.opp).toMatchObject({ pts: 3, fgm: 1, fga: 2, ftm: 1, fta: 2, oreb: 1, stl: 1, pf: 0 })
    expect(s.focus.orebPct).toBeNull() // 0 / (0 OREB + AWY's 0 DREB): no denominator yet
    expect(s.opp.orebPct).toBe(1 / (1 + 1))
    expect(s.focus.efgPct).toBeCloseTo(1.5, 9)
    expect(s.focus.tovPct).toBeCloseTo(1 / (1 + 1), 9)
    expect(s.focusPlayers[0]).toMatchObject({ personId: '1', name: 'Alpha One', pts: 3, reb: 1, tov: 1 })
    expect(s.focusPlayers.find((p) => p.personId === '2')).toMatchObject({ ast: 1, blk: 1 })
  })

  it('splits stretches at the mark', () => {
    const seg = stretchBox(plays, events, 360, 720, ctx)
    expect(seg.focus.pts).toBe(2)
    expect(seg.opp.pts).toBe(0)
    expect(seg.opp.fga).toBe(0) // the heave isn't an attempt
  })

  it('finds foul trouble at the mark (technicals excluded)', () => {
    const two = [...plays, act({ clock: 'PT07M00.00S', teamTricode: 'HOM', actionType: 'foul', subType: 'personal', personId: 2, playerNameI: 'B. Two' })]
    const [mid] = reportMarks(4)
    expect(foulTroubleAt(two, mid, ctx)).toEqual([{ personId: '2', name: 'B. Two', tricode: 'HOM', fouls: 2, status: 'trouble' }])
    expect(foulTroubleAt(plays, mid, ctx)).toEqual([])
  })
})

describe('runs and keys', () => {
  it('lists runs that ended inside the stretch', () => {
    order = 0
    const plays = [
      act({ scoreHome: '0', scoreAway: '0' }),
      ...([[2, 'PT11M00.00S'], [4, 'PT10M00.00S'], [7, 'PT09M00.00S']] as const).map(([h, clock]) =>
        act({ clock, teamTricode: 'HOM', actionType: '2pt', shotResult: 'Made', scoreHome: String(h), scoreAway: '0' })),
      act({ clock: 'PT05M00.00S', teamTricode: 'AWY', actionType: '2pt', shotResult: 'Made', scoreHome: '7', scoreAway: '2' }),
    ]
    const events = scoringEvents(plays)
    expect(runsEndingIn(events, -1, 360, { home: 'HOM', away: 'AWY' })).toEqual([{ tricode: 'HOM', points: 7, since: 'Q1 11:00', until: 'Q1 9:00' }])
    expect(runsEndingIn(events, 360, 720, { home: 'HOM', away: 'AWY' })).toEqual([])
  })

  it('compares tonight with the season in the right direction', () => {
    const season: SeasonFactors = { efgPct: 0.55, tovPct: 0.14, orebPct: 0.25, ftRate: 0.25, oppEfgPct: 0.53, oppTovPct: 0.13, oppOrebPct: 0.27, oppFtRate: 0.22 }
    const side = (o: Partial<Record<'efgPct' | 'tovPct' | 'orebPct' | 'ftRate', number | null>>) => ({ efgPct: null, tovPct: null, orebPct: null, ftRate: null, ...o }) as never
    const keys = keyChecks(
      { focus: side({ efgPct: 0.6, tovPct: 0.2, orebPct: 0.25, ftRate: null }), opp: side({ efgPct: 0.5, tovPct: 0.1, orebPct: 0.3, ftRate: 0.3 }) },
      { focus: season, opp: { ...season, efgPct: 0.51 } },
    )
    const v = Object.fromEntries(keys.map((k) => [`${k.side}:${k.metric}`, k.verdict]))
    expect(v).toEqual({
      'offense:efgPct': 'better', 'offense:tovPct': 'worse', 'offense:orebPct': 'even', 'offense:ftRate': null,
      'defense:efgPct': 'better', 'defense:tovPct': 'worse', 'defense:orebPct': 'worse', 'defense:ftRate': 'worse',
    })
    expect(keys.find((k) => k.side === 'defense' && k.metric === 'efgPct')).toMatchObject({ season: 0.53, opponentSeason: 0.51 })
    expect(keyChecks({ focus: side({}), opp: side({}) }, undefined).every((k) => k.season === null && k.verdict === null)).toBe(true)
  })
})

describe('checkpoint reports on a real game (GSW @ LAL, Oct 21 2026, final 127-105)', () => {
  const fixture = JSON.parse(readFileSync(path.resolve(__dirname, '../fixtures/live-game-0022600005.json'), 'utf8')) as {
    box: RawLiveBoxScore
    actions: RawLiveAction[]
  }
  const names = new Map<string, string>()
  for (const t of [fixture.box.homeTeam, fixture.box.awayTeam]) for (const p of t.players) names.set(String(p.personId), p.name)
  const { reports, next } = buildCheckpointReports(fixture.actions, 4, {
    focus: { tricode: 'LAL', isHome: true }, opp: { tricode: 'GSW' }, elapsedNow: 2880, names,
  })

  it('has all eight reports and nothing pending once the game is over', () => {
    expect(reports.map((r) => r.label)).toEqual(['Q1 6:00', 'End of Q1', 'Q2 6:00', 'End of Q2', 'Q3 6:00', 'End of Q3', 'Q4 6:00', 'End of Q4'])
    expect(next).toBeNull()
  })

  it('ends at the final score, and stretches add up to it', () => {
    const last = reports.at(-1)!
    expect(last.score).toEqual({ focus: 127, opp: 105 })
    expect(reports.reduce((s, r) => s + r.segment.focus.pts, 0)).toBe(127)
    expect(reports.reduce((s, r) => s + r.segment.opp.pts, 0)).toBe(105)
    expect(reports[1].score).toEqual({ focus: 34, opp: 33 }) // end of Q1
    expect(reports[3].score).toEqual({ focus: 66, opp: 52 }) // halftime
  })

  it('matches the box score at the end (eFG% and Dončić line from the post-game report)', () => {
    const last = reports.at(-1)!
    expect(last.game.focus.efgPct).toBeCloseTo(0.636, 3)
    expect(last.game.focusPlayers[0]).toMatchObject({ name: 'Luka Dončić', pts: 28, fgm: 7, fga: 18, fg3m: 5, fg3a: 12, ftm: 9, fta: 9, tov: 6 })
  })

  it('writes factual headlines', () => {
    expect(reports[0].headlines[0]).toBe('Tied 15-15; the stretch since tip-off was even at 15-15.')
    expect(reports[0].headlines).toContain('GSW went on an 8-0 run (Q1 9:01 to Q1 7:39).')
    expect(reports[3].headlines[0]).toBe('LAL lead 66-52; LAL won the stretch since Q2 6:00 21-9.')
    expect(reports[1].headlines[0]).toMatch(/since the end of Q1|since Q1 6:00/)
  })

  it('adds a Watch line only when a factor is clearly worse than the season', () => {
    const season = { efgPct: 0.55, tovPct: 0.15, orebPct: 0.27, ftRate: 0.3, oppEfgPct: 0.54, oppTovPct: 0.16, oppOrebPct: 0.3, oppFtRate: 0.33 }
    const run = (s: typeof season) => buildCheckpointReports(fixture.actions, 4, {
      focus: { tricode: 'LAL', isHome: true }, opp: { tricode: 'GSW' }, elapsedNow: 2880, names, season: { focus: s, opp: s },
    }).reports
    // final TOV% was 16.2%: 1.2 points worse than 15.0% is noise, no Watch line
    expect(run(season).at(-1)!.headlines.some((h) => h.startsWith('Watch'))).toBe(false)
    // against a 12% season it's 4.2 points worse
    expect(run({ ...season, tovPct: 0.12 }).at(-1)!.headlines).toContain('Watch: our TOV% is 16.2% so far vs 12.0% on the season.')
  })

  it('leaves season comparisons empty without a baseline', () => {
    expect(reports[0].keys.every((k) => k.season === null && k.verdict === null)).toBe(true)
  })
})

describe('reportKeys', () => {
  it('reads the numbered keys under the heading, stopping at the next heading', () => {
    const md = '# T\n\n## Keys to the game\n1. **Take care of the ball.** We are 27th.\n2. **Hold the glass.**\n   Second line.\n\n## Other\n- not a key\n'
    expect(reportKeys(md)).toEqual(['**Take care of the ball.** We are 27th.', '**Hold the glass.** Second line.'])
    expect(reportKeys('# No keys here')).toEqual([])
  })
  it('reads a saved scouting report', () => {
    const md = readFileSync(path.resolve(__dirname, '../../../../scouting/2026-10-30-LAL-at-GSW.md'), 'utf8')
    const keys = reportKeys(md)
    expect(keys.length).toBe(3)
    expect(keys[0]).toMatch(/^\*\*Take care of the ball\.\*\*/)
  })
})
