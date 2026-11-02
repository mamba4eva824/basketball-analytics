import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { callContext, keepCall, newCalls, playCalls, trimQueue, type CallContext, type PlayCall } from '@/lib/analytics/playCalls'
import type { RawLiveAction, RawLiveBoxScore } from '@/lib/analytics/live'

const LAL = '1610612747'

const ctx: CallContext = {
  focusTricode: 'LAL',
  home: { tricode: 'LAL', name: 'Lakers' },
  away: { tricode: 'GSW', name: 'Warriors' },
  names: new Map([
    [1, 'Reaves'], [2, 'Dončić'], [3, 'Kessler'], [4, 'Thybulle'],
    [11, 'Curry'], [12, 'Green'], [13, 'Butler'],
  ]),
  regulation: 4,
}

let order = 0
function act(o: Partial<RawLiveAction>): RawLiveAction {
  order += 1
  return { actionNumber: order, orderNumber: order, period: 1, clock: 'PT10M00.00S', actionType: 'rebound', scoreHome: '0', scoreAway: '0', ...o }
}

const lal = (o: Partial<RawLiveAction>) => act({ teamTricode: 'LAL', ...o })
const gsw = (o: Partial<RawLiveAction>) => act({ teamTricode: 'GSW', ...o })
const texts = (calls: PlayCall[]) => calls.map((c) => c.text)

describe('callContext', () => {
  const player = (personId: number, name: string, familyName: string) => ({ personId, name, nameI: '', familyName })
  const box = {
    regulationPeriods: 4,
    homeTeam: { teamId: 1610612747, teamName: 'Lakers', teamTricode: 'LAL', players: [player(1, 'Austin Reaves', 'Reaves'), player(5, 'Ziaire Williams', 'Williams')] },
    awayTeam: { teamId: 1610612744, teamName: 'Warriors', teamTricode: 'GSW', players: [player(11, 'Stephen Curry', 'Curry'), player(15, 'Grant Williams', 'Williams')] },
  } as unknown as RawLiveBoxScore

  it('uses family names, and full names when two players share one', () => {
    const c = callContext(box, LAL)
    expect(c.focusTricode).toBe('LAL')
    expect(c.names.get(1)).toBe('Reaves')
    expect(c.names.get(5)).toBe('Ziaire Williams')
    expect(c.names.get(15)).toBe('Grant Williams')
  })

  it('finds the focus team on the road too', () => {
    expect(callContext(box, '1610612744').focusTricode).toBe('GSW')
  })
})

describe('made shots', () => {
  it('builds the call from structured fields, never the shorthand description', () => {
    const [call] = playCalls([
      lal({ actionType: '3pt', subType: 'Jump Shot', descriptor: 'step back', shotResult: 'Made', personId: 2, shotDistance: 26.1, assistPersonId: 1, scoreHome: '3', description: "L. Dončić 26' step back 3PT (3 PTS) (A. Reaves 1 AST)" }),
    ], ctx)
    expect(call.priority).toBe(1)
    expect(call.text).toMatch(/^Dončić (with|hits) the step-back three/)
    expect(call.text).toContain('Reaves')
    expect(call.text).toContain('Lakers on the board first.')
    expect(call.text).not.toMatch(/PTS|AST|3PT|'/)
  })

  it('says the distance on deep threes', () => {
    const [call] = playCalls([lal({ actionType: '3pt', subType: 'Jump Shot', shotResult: 'Made', personId: 1, shotDistance: 29.6, scoreHome: '3' })], ctx)
    expect(call.text).toMatch(/^Wow! Reaves, three from 30 feet\.\.\./)
  })

  it('names the passer once on an alley-oop', () => {
    const [call] = playCalls([lal({ actionType: '2pt', subType: 'DUNK', descriptor: 'alley-oop', shotResult: 'Made', personId: 3, assistPersonId: 2, scoreHome: '2' })], ctx)
    expect(call.text).toMatch(/^[^.]*! Dončić lobs it up\.\.\. Kessler throws it down!/)
    expect(call.text.match(/Dončić/g)).toHaveLength(1)
  })

  it('calls fast breaks and the jump-shot style', () => {
    const [call] = playCalls([lal({ actionType: '2pt', subType: 'Jump Shot', descriptor: 'driving floating bank', qualifiers: ['fastbreak'], shotResult: 'Made', personId: 1, shotDistance: 8, scoreHome: '2' })], ctx)
    expect(call.text).toMatch(/^On the break, Reaves drives, floater off the glass\.\.\./)
  })

  it('tracks ties, lead changes and the margin', () => {
    const calls = playCalls([
      gsw({ actionType: '2pt', subType: 'Layup', shotResult: 'Made', personId: 11, scoreAway: '2' }),
      lal({ actionType: '2pt', subType: 'Layup', shotResult: 'Made', personId: 1, scoreHome: '2', scoreAway: '2' }),
      lal({ actionType: '3pt', subType: 'Jump Shot', shotResult: 'Made', personId: 1, scoreHome: '5', scoreAway: '2' }),
      gsw({ actionType: '2pt', subType: 'Layup', shotResult: 'Made', personId: 11, scoreHome: '5', scoreAway: '4' }),
      gsw({ actionType: '3pt', subType: 'Jump Shot', shotResult: 'Made', personId: 11, scoreHome: '5', scoreAway: '7' }),
    ], ctx)
    expect(calls.map((c) => c.text.split(/[.!] /).pop())).toEqual([
      'Warriors on the board first.',
      'All tied at 2.',
      'Lakers back in front, 5 to 2.',
      'Lakers up 1.',
      'Warriors take the lead, 7 to 5.',
    ])
  })

  it('announces runs and scoring milestones when first reached', () => {
    const shots = [2, 4, 6, 8, 10].map((pts) => lal({ actionType: '2pt', subType: 'DUNK', shotResult: 'Made', personId: 1, scoreHome: String(pts), pointsTotal: pts + 10 }))
    const calls = playCalls(shots, ctx)
    expect(calls[2].text).not.toContain('straight points')
    expect(calls[3].text).toContain("That's 8 straight points for the Lakers.")
    expect(calls[4].text).toContain("That's 10 straight points for the Lakers.")
    expect(calls.filter((c) => c.text.includes("That's 20 for Reaves.")).map((c) => c.order)).toEqual([shots[4].orderNumber])
  })

  it('reads the clock in the last two minutes', () => {
    const calls = playCalls([
      act({ period: 4, clock: 'PT01M30.00S', actionType: 'rebound', scoreHome: '98', scoreAway: '96' }),
      lal({ period: 4, clock: 'PT01M12.00S', actionType: '2pt', subType: 'Layup', shotResult: 'Made', personId: 1, scoreHome: '100', scoreAway: '98' }),
      lal({ period: 4, clock: 'PT00M04.20S', actionType: '2pt', subType: 'Layup', shotResult: 'Made', personId: 1, scoreHome: '102', scoreAway: '98' }),
      lal({ period: 3, clock: 'PT01M12.00S', actionType: '2pt', subType: 'Layup', shotResult: 'Made', personId: 1, scoreHome: '104', scoreAway: '98' }),
    ], ctx)
    expect(calls[0].text).toMatch(/^1:12 left\. Reaves lays it in\. Lakers lead 100 to 98\.$/)
    expect(calls[1].text).toMatch(/^5 seconds left\./)
    expect(calls[2].text).toMatch(/^Reaves/)
  })
})

describe('free throws', () => {
  it('merges a trip into one call, even with a substitution in between', () => {
    const calls = playCalls([
      gsw({ actionType: 'foul', subType: 'personal', descriptor: 'shooting', personId: 11, foulDrawnPersonId: 3, foulPersonalTotal: 1 }),
      lal({ actionType: 'freethrow', subType: '1 of 2', shotResult: 'Made', personId: 3, scoreHome: '1', pointsTotal: 1 }),
      gsw({ actionType: 'substitution', subType: 'out', personId: 11, scoreHome: '1' }),
      gsw({ actionType: 'substitution', subType: 'in', personId: 13, scoreHome: '1' }),
      lal({ actionType: 'freethrow', subType: '2 of 2', shotResult: 'Missed', personId: 3, scoreHome: '1' }),
    ], ctx, 'everything')
    expect(texts(calls)).toEqual([
      'Curry fouls Kessler on the shot.',
      'Butler checks in for Curry.',
      'Kessler splits the pair at the line. Lakers on the board first.',
    ])
    expect(calls[2].id).toBe(order)
    expect(calls[2].priority).toBe(1)
  })

  it('calls an and-one as a three- or four-point play', () => {
    const calls = playCalls([
      lal({ clock: 'PT05M00.00S', actionType: '3pt', subType: 'Jump Shot', shotResult: 'Made', personId: 1, scoreHome: '3' }),
      lal({ clock: 'PT05M00.00S', actionType: 'freethrow', subType: '1 of 1', shotResult: 'Made', personId: 1, scoreHome: '4' }),
    ], ctx)
    expect(calls[1].text).toMatch(/^Are you kidding me\?! Reaves completes the four-point play! Lakers up 4\.$/)
  })

  it('treats a missed trip as a highlight, not a score', () => {
    const [call] = playCalls([
      lal({ actionType: 'freethrow', subType: '1 of 2', shotResult: 'Missed', personId: 3 }),
      lal({ actionType: 'freethrow', subType: '2 of 2', shotResult: 'Missed', personId: 3 }),
    ], ctx)
    expect(call).toMatchObject({ priority: 2, text: 'Kessler misses both free throws.' })
  })

  it('names technical free throws', () => {
    const [call] = playCalls([lal({ actionType: 'freethrow', subType: '1 of 1', descriptor: 'technical', shotResult: 'Made', personId: 2, scoreHome: '1' })], ctx)
    expect(call.text).toMatch(/^Dončić makes the technical free throw\./)
  })
})

describe('defense and turnovers', () => {
  it('calls a block from the missed shot and skips the separate block action', () => {
    const calls = playCalls([
      gsw({ actionType: '2pt', subType: 'Layup', shotResult: 'Missed', personId: 11, blockPersonId: 3 }),
      lal({ actionType: 'block', personId: 3 }),
    ], ctx)
    expect(calls).toHaveLength(1)
    expect(calls[0].priority).toBe(2)
    expect(calls[0].text).toMatch(/Kessler/)
    expect(calls[0].tricodes).toEqual(['GSW', 'LAL'])
  })

  it('calls a steal from the turnover and skips the separate steal action', () => {
    const calls = playCalls([
      gsw({ actionType: 'turnover', subType: 'bad pass', personId: 12, stealPersonId: 4 }),
      lal({ actionType: 'steal', personId: 4 }),
    ], ctx)
    expect(calls).toHaveLength(1)
    expect(calls[0].text).toMatch(/^Thybulle (picks off the pass from Green|jumps the passing lane)/)
  })

  it('calls the charge from the foul, not the duplicate turnover', () => {
    const calls = playCalls([
      lal({ actionType: 'foul', subType: 'offensive', descriptor: 'charge', personId: 2, foulPersonalTotal: 1 }),
      lal({ actionType: 'turnover', subType: 'offensive foul', personId: 2 }),
    ], ctx)
    expect(texts(calls)).toEqual(['Dončić is called for the charge.'])
  })

  it('does not double the period after a name ending in "Jr."', () => {
    const c = { ...ctx, names: new Map([[21, 'Jackson Jr.']]) }
    const [call] = playCalls([act({ teamTricode: 'GSW', period: 4, actionType: 'foul', subType: 'personal', personId: 21, foulPersonalTotal: 5 })], c)
    expect(call.text).toBe("Foul on Jackson Jr. That's foul number 5 on Jackson Jr.")
  })

  it('names the team on team turnovers', () => {
    const [call] = playCalls([lal({ actionType: 'turnover', subType: 'shot clock', qualifiers: ['team'] })], ctx)
    expect(call.text).toBe('Shot-clock violation on the Lakers.')
  })

  it('promotes foul trouble and foul-outs to highlights', () => {
    const calls = playCalls([
      lal({ period: 2, actionType: 'foul', subType: 'personal', personId: 3, foulPersonalTotal: 2 }),
      lal({ period: 2, actionType: 'foul', subType: 'personal', personId: 3, foulPersonalTotal: 3 }),
      lal({ period: 4, actionType: 'foul', subType: 'personal', personId: 3, foulPersonalTotal: 6 }),
    ], ctx)
    expect(texts(calls)).toEqual([
      "Foul on Kessler. That's foul number 3 on Kessler.",
      "Foul on Kessler. That's six fouls. Kessler has fouled out.",
    ])
  })
})

describe('game flow', () => {
  it('calls period breaks with the score, and overtime when tied', () => {
    const calls = playCalls([
      act({ actionType: 'period', subType: 'start', period: 1, clock: 'PT12M00.00S' }),
      act({ actionType: 'period', subType: 'end', period: 1, clock: 'PT00M00.00S', scoreHome: '30', scoreAway: '25' }),
      act({ actionType: 'period', subType: 'end', period: 2, clock: 'PT00M00.00S', scoreHome: '55', scoreAway: '55' }),
      act({ actionType: 'period', subType: 'end', period: 4, clock: 'PT00M00.00S', scoreHome: '110', scoreAway: '110' }),
      act({ actionType: 'period', subType: 'start', period: 5, clock: 'PT05M00.00S', scoreHome: '110', scoreAway: '110' }),
      act({ actionType: 'period', subType: 'end', period: 5, clock: 'PT00M00.00S', scoreHome: '121', scoreAway: '117' }),
      act({ actionType: 'game', subType: 'end', period: 5, clock: 'PT00M00.00S', scoreHome: '121', scoreAway: '117' }),
    ], ctx)
    expect(texts(calls)).toEqual([
      "We're underway, Warriors at Lakers.",
      "That's the end of the first quarter. Lakers lead 30 to 25.",
      "That's halftime. All tied at 55.",
      "We're headed to overtime, tied at 110!",
      'The overtime is underway.',
      "Ball game! That's the final. The Lakers win it, 121 to 117.",
    ])
  })

  it('calls timeouts and challenges', () => {
    const calls = playCalls([
      gsw({ actionType: 'timeout', subType: 'full', scoreHome: '10', scoreAway: '4' }),
      lal({ actionType: 'timeout', subType: 'challenge', scoreHome: '10', scoreAway: '4' }),
    ], ctx)
    expect(texts(calls)).toEqual(['Timeout, Warriors. Lakers lead 10 to 4.', 'The Lakers are challenging the call.'])
  })
})

describe('levels', () => {
  const call = (priority: 1 | 2 | 3, tricodes: string[]): PlayCall => ({ id: 1, order: 1, period: 1, clock: '', tricodes, priority, hype: 0, text: '' })

  it('focus keeps every score but only the focus team’s highlights', () => {
    expect(keepCall(call(1, ['GSW']), 'focus', 'LAL')).toBe(true)
    expect(keepCall(call(2, ['GSW']), 'focus', 'LAL')).toBe(false)
    expect(keepCall(call(2, ['GSW', 'LAL']), 'focus', 'LAL')).toBe(true)
    expect(keepCall(call(2, ['GSW']), 'highlights', 'LAL')).toBe(true)
    expect(keepCall(call(3, ['LAL']), 'highlights', 'LAL')).toBe(false)
    expect(keepCall(call(3, ['GSW']), 'everything', 'LAL')).toBe(true)
  })
})

describe('listening queue', () => {
  const call = (order: number, priority: 1 | 2 | 3, tricodes = ['LAL']): PlayCall => ({ id: order, order, period: 1, clock: '', tricodes, priority, hype: 0, text: `call ${order}` })

  it('takes only calls after the last one heard, at the chosen level', () => {
    const calls = [call(1, 1), call(2, 2, ['GSW']), call(3, 2), call(4, 3), call(5, 1, ['GSW'])]
    expect(newCalls(calls, 1, 'focus', 'LAL').map((c) => c.order)).toEqual([3, 5])
    expect(newCalls(calls, 1, 'highlights', 'LAL').map((c) => c.order)).toEqual([2, 3, 5])
    expect(newCalls(calls, 4, 'everything', 'LAL').map((c) => c.order)).toEqual([5])
  })

  it('leaves a short queue alone', () => {
    const q = [call(1, 2), call(2, 3)]
    expect(trimQueue(q)).toBe(q)
  })

  it('drops waiting minor calls first, keeping the newest, then the oldest baskets', () => {
    expect(trimQueue([call(1, 2), call(2, 1), call(3, 3), call(4, 1), call(5, 2)]).map((c) => c.order)).toEqual([2, 4, 5])
    expect(trimQueue([1, 2, 3, 4, 5, 6].map((o) => call(o, 1))).map((c) => c.order)).toEqual([3, 4, 5, 6])
  })

  it('keeps a huge play even when it is only a highlight', () => {
    const huge = { ...call(1, 2), hype: 2 as const }
    expect(trimQueue([huge, call(2, 3), call(3, 3), call(4, 2), call(5, 3)]).map((c) => c.order)).toEqual([1, 5])
  })
})

describe('big plays', () => {
  const made = (o: Partial<RawLiveAction>) => ({ actionType: '2pt', subType: 'Jump Shot', shotResult: 'Made', personId: 1, ...o })

  it('leaves routine baskets alone', () => {
    const [call] = playCalls([lal(made({ scoreHome: '2' }))], ctx)
    expect(call.hype).toBe(0)
    expect(call.text).toMatch(/^Reaves, jumper\.\.\. /)
  })

  it('marks dunks, blocks and steals as big, without an exclamation', () => {
    const calls = playCalls([
      lal(made({ subType: 'DUNK', scoreHome: '2' })),
      gsw({ actionType: '2pt', subType: 'Layup', shotResult: 'Missed', personId: 11, blockPersonId: 3 }),
      gsw({ actionType: 'turnover', subType: 'bad pass', personId: 11, stealPersonId: 4 }),
    ], ctx)
    expect(calls.map((c) => c.hype)).toEqual([1, 1, 1])
    expect(calls.every((c) => !c.text.match(/^(Oh|Are|Wow|What|Unbelievable)/))).toBe(true)
  })

  it('opens huge Lakers plays with an exclamation', () => {
    const [lob] = playCalls([lal(made({ subType: 'DUNK', descriptor: 'alley-oop', personId: 3, assistPersonId: 2, scoreHome: '2' }))], ctx)
    expect(lob.hype).toBe(2)
    expect(lob.text).toMatch(/^[^.]*! Dončić lobs it up\.\.\. Kessler throws it down!/)
  })

  it('calls a clutch go-ahead basket huge', () => {
    const calls = playCalls([
      gsw(made({ period: 4, clock: 'PT01M00.00S', personId: 11, scoreAway: '100', scoreHome: '99' })),
      lal(made({ period: 4, clock: 'PT00M30.00S', actionType: '3pt', shotDistance: 25, scoreHome: '102', scoreAway: '100' })),
    ], ctx)
    expect(calls[1].hype).toBe(2)
    expect(calls[1].text).toMatch(/! 30 seconds left\. Reaves/)
  })

  it('keeps the other team’s huge plays at big, with no exclamation', () => {
    const [call] = playCalls([gsw(made({ actionType: '3pt', shotDistance: 31, personId: 11, scoreAway: '3' }))], ctx)
    expect(call.hype).toBe(1)
    expect(call.text).toMatch(/^Curry, three from 31 feet/)
  })
})

describe('a real Lakers game (GSW @ LAL, Oct 21 2026)', () => {
  const fixture = JSON.parse(readFileSync(path.resolve(__dirname, '../fixtures/live-game-0022600005.json'), 'utf8')) as {
    box: RawLiveBoxScore
    actions: RawLiveAction[]
  }
  const c = callContext(fixture.box, LAL)
  const all = playCalls(fixture.actions, c, 'everything')
  const highlights = playCalls(fixture.actions, c, 'highlights')

  it('reads every made basket exactly once', () => {
    const made = fixture.actions.filter((a) => (a.actionType === '2pt' || a.actionType === '3pt') && a.shotResult === 'Made')
    const called = new Set(highlights.map((x) => x.id))
    expect(made.every((a) => called.has(a.actionNumber))).toBe(true)
  })

  it('produces clean spoken sentences', () => {
    for (const x of all) {
      expect(x.text).toMatch(/[.!]$/)
      expect(x.text).not.toMatch(/undefined|null|NaN|PTS|AST|REBOUND|TURNOVER|\bthe the\b|\s{2}/)
    }
  })

  it('keeps highlights to a listenable count', () => {
    expect(highlights.length).toBeGreaterThan(120)
    expect(highlights.length).toBeLessThan(230)
    expect(playCalls(fixture.actions, c, 'focus').length).toBeLessThan(highlights.length)
  })

  it('ends with the real final score', () => {
    expect(all.at(-1)?.text).toBe("Ball game! That's the final. The Lakers win it, 127 to 105.")
  })
})
