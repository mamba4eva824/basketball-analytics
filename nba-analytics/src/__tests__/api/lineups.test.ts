import { describe, test, expect } from 'vitest'
import { apiFetch, LEBRON_ID, SEASON } from '../setup'
import type { LineupLabData } from '@/lib/dashboard-types'

/**
 * Lineup Lab against scripts/seed-test-data.ts: two Lakers stints — LeBron + AD together for
 * 20 min (+8), then LeBron without AD for 12 min (+1).
 */
const AD_ID = '203076'
type Body = { success: boolean; data: LineupLabData; error?: { message: string } }

describe('GET /api/lineups', () => {
  test('returns the player pool and loaded group sizes', async () => {
    const { status, body } = await apiFetch<Body>(`/api/lineups?season=${SEASON}`)
    expect(status).toBe(200)
    expect(body.data.sizes).toEqual([0, 1, 2, 3, 4, 5])
    const ids = body.data.pool.map((p) => p.id)
    expect(ids[0]).toBe(LEBRON_ID) // most minutes first (four tied at 32), then by name
    expect(body.data.pool.find((p) => p.id === LEBRON_ID)).toMatchObject({ name: 'LeBron James', minutes: 32, onRoster: true })
    expect(body.data.rows.map((r) => r.kind)).toEqual(['team'])
  })

  test('computes together, either way and without from group totals', async () => {
    const { body } = await apiFetch<Body>(`/api/lineups?season=${SEASON}&on=${LEBRON_ID},${AD_ID}`)
    const rows = body.data.rows
    expect(rows.map((r) => [r.kind, r.label])).toEqual([
      ['selection', 'James + Davis'],
      ['any', 'Davis'],
      ['without', 'Davis, no James'],
      ['any', 'James'],
      ['without', 'James, no Davis'],
      ['team', 'Lakers, all minutes'],
    ])
    const [together, , adWithoutLebron, , lebronWithoutAd, team] = rows
    expect(together).toMatchObject({ minutes: 20, plusMinus: 8, gamesPlayed: 1, smallSample: true, error: null })
    expect(lebronWithoutAd).toMatchObject({ minutes: 12, plusMinus: 1, gamesPlayed: null, removed: AD_ID })
    expect(adWithoutLebron.error).toMatch(/Never on the floor/)
    expect(team).toMatchObject({ minutes: 32, plusMinus: 9, gamesPlayed: 2 })
    expect(together.netRtg).toBeCloseTo(together.offRtg! - together.defRtg!, 9)
  })

  test('rejects more than five players and bad IDs', async () => {
    const tooMany = await apiFetch<Body>(`/api/lineups?season=${SEASON}&on=1,2,3&off=4,5,6`)
    expect(tooMany.status).toBe(200)
    expect(tooMany.body.data.error).toMatch(/at most 5/)
    expect(tooMany.body.data.rows).toEqual([])
    const bad = await apiFetch<Body>('/api/lineups?on=abc')
    expect(bad.status).toBe(400)
  })
})

describe('GET /api/live/reports', () => {
  test('requires a 10-digit game ID', async () => {
    expect((await apiFetch('/api/live/reports')).status).toBe(400)
    expect((await apiFetch('/api/live/reports?game=123')).status).toBe(400)
  })
})
