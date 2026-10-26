import { describe, it, expect } from 'vitest'
import { scoringEvents, type RawLiveAction } from '@/lib/analytics/live'
import { bestStretch, checkpointMarks, closingStretch, leadForGood, periodPoints, periodSplits, unansweredRuns } from '@/lib/analytics/postgame'

let order = 0
function act(o: Partial<RawLiveAction>): RawLiveAction {
  order += 1
  return { actionNumber: order, orderNumber: order, period: 1, clock: 'PT12M00.00S', actionType: 'rebound', ...o }
}

/** HOM is home, AWY (the focus team) is away. Each tuple: period, clock, team, type, made, away score, home score. */
function game(plays: [number, string, 'HOM' | 'AWY', string, boolean, number, number][]): RawLiveAction[] {
  order = 0
  return [
    act({ actionType: 'period', scoreHome: '0', scoreAway: '0' }),
    ...plays.map(([period, clock, team, type, made, away, home]) =>
      act({
        period, clock, teamTricode: team, actionType: type, personId: team === 'AWY' ? 1 : 2, playerNameI: `${team} star`,
        isFieldGoal: type === 'freethrow' ? 0 : 1, shotResult: made ? 'Made' : 'Missed',
        scoreAway: String(away), scoreHome: String(home),
      })),
  ]
}

// AWY trails 0-7 early, wins 14-9 late
const plays = game([
  [1, 'PT11M00.00S', 'HOM', '2pt', true, 0, 2],
  [1, 'PT10M00.00S', 'HOM', '3pt', true, 0, 5],
  [1, 'PT09M00.00S', 'HOM', '2pt', true, 0, 7],
  [1, 'PT08M00.00S', 'AWY', '3pt', false, 0, 7],
  [4, 'PT06M00.00S', 'AWY', '3pt', true, 3, 7],
  [4, 'PT05M30.00S', 'AWY', '3pt', true, 6, 7],
  [4, 'PT04M00.00S', 'HOM', '2pt', true, 6, 9],
  [4, 'PT03M00.00S', 'AWY', '2pt', true, 8, 9],
  [4, 'PT02M00.00S', 'AWY', '3pt', true, 11, 9],
  [4, 'PT01M00.00S', 'AWY', 'freethrow', true, 12, 9],
  [4, 'PT00M30.00S', 'AWY', '2pt', true, 14, 9],
])
const events = scoringEvents(plays)

describe('postgame facts', () => {
  it('splits shooting and points by period', () => {
    const s = periodSplits(plays, ['AWY', 'HOM'], 4)
    expect(s.HOM[0]).toMatchObject({ period: 'Q1', pts: 7, fgm: 3, fga: 3, fg3m: 1 })
    expect(s.AWY[0]).toMatchObject({ pts: 0, fga: 1, fg3a: 1 })
    expect(s.AWY[3]).toMatchObject({ period: 'Q4', pts: 14, fgm: 5, fga: 5, fg3m: 3, ftm: 1, fta: 1 })
  })

  it('lists unanswered runs of the minimum size', () => {
    expect(unansweredRuns(events, { home: 'HOM', away: 'AWY' }, 6)).toEqual([
      { tricode: 'HOM', points: 7, since: 'Q1 11:00' },
      { tricode: 'AWY', points: 6, since: 'Q4 6:00' },
      { tricode: 'AWY', points: 8, since: 'Q4 3:00' },
    ])
  })

  it('finds the best net stretch, with scores from the focus team view', () => {
    expect(bestStretch(events, false, false)).toMatchObject({ net: 12, from: 'Q4 6:00', to: 'Q4 0:30', fromScore: '0-7', toScore: '14-9' })
    expect(bestStretch(events, true, false)).toMatchObject({ net: 7, fromScore: '0-0', toScore: '0-7' })
  })

  it('finds when the lead was taken for good, or null after a loss', () => {
    expect(leadForGood(events, false)).toEqual({ at: 'Q4 2:00', score: '11-9' })
    expect(leadForGood(events, true)).toBeNull()
  })

  it('takes period points from the score, so a basket taken back does not count', () => {
    const corrected = [
      ...plays,
      // a correction after the final AWY basket: the scoreboard drops 14-9 → 12-9 while the shot stays "Made"
      act({ period: 4, clock: 'PT00M10.00S', actionType: 'instantreplay', teamTricode: 'AWY', scoreAway: '12', scoreHome: '9' }),
    ]
    const ev = scoringEvents(corrected)
    expect(periodPoints(ev, 4)).toEqual({ home: [7, 0, 0, 2], away: [0, 0, 0, 12] })
    expect(periodSplits(corrected, ['AWY', 'HOM'], 4).AWY[3].pts).toBe(14) // made shots, before reconciling
  })

  it('reports 6:00/2:00 in Q4 and only 2:00 in a five-minute overtime', () => {
    expect(checkpointMarks(1, 4)).toEqual([0])
    expect(checkpointMarks(2, 4)).toEqual([360, 0])
    expect(checkpointMarks(4, 4)).toEqual([360, 120, 0])
    expect(checkpointMarks(4, 5)).toEqual([360, 120, 0])
    expect(checkpointMarks(5, 5)).toEqual([120, 0])
    expect(checkpointMarks(5, 6)).toEqual([0])
  })

  it('summarizes the closing stretch and who scored it', () => {
    expect(closingStretch(plays, events, { focusTricode: 'AWY', focusIsHome: false, lastPeriod: 4 })).toEqual({
      seconds: 300, fromScore: '6-7', focusPoints: 8, oppPoints: 2, focusScorers: { 'AWY star': 8 },
    })
  })
})
