import { describe, test, expect } from 'vitest'
import { apiFetch, SEASON } from '../setup'
import type { SeasonProgressData } from '@/lib/dashboard-types'

type Body = { success: boolean; data: SeasonProgressData }

describe('GET /api/progress', () => {
  test('returns the focus areas, one history point per game, and consistent cards', async () => {
    const { status, body } = await apiFetch<Body>(`/api/progress?season=${SEASON}`)
    expect(status).toBe(200)
    const d = body.data
    expect(d.focusDefault).toEqual(['tovPct', 'orebPct', 'oppOrebPct', 'defRtg', 'netRtg'])
    expect(d.history.length).toBe(d.games)
    expect(d.games).toBeGreaterThan(0)
    const last = d.history.at(-1)!
    for (const m of d.focusDefault) {
      expect(d.cards[m].season).toBe(last.toDate[m])
      expect(d.cards[m].rank).toBe(last.rank[m])
    }
    expect(d.blocks.reduce((s, b) => s + b.games, 0)).toBe(d.games)
    expect(d.months.reduce((s, b) => s + b.games, 0)).toBe(d.games)
    expect(typeof last.date).toBe('string')
  })

  test('rejects a malformed season', async () => {
    expect((await apiFetch('/api/progress?season=2025')).status).toBe(400)
  })
})
