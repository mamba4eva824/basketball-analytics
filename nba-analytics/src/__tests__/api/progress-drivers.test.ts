import { describe, test, expect } from 'vitest'
import { apiFetch, SEASON, LEBRON_ID } from '../setup'
import type { PlayerDriversData } from '@/lib/dashboard-types'

type Body = { success: boolean; data: PlayerDriversData }

describe('GET /api/progress/drivers', () => {
  test('returns box-score drivers with names, and on/off from the lineup totals', async () => {
    const { status, body } = await apiFetch<Body>(`/api/progress/drivers?season=${SEASON}`)
    expect(status).toBe(200)
    const d = body.data
    expect(d.teamGames).toBeGreaterThan(0)
    for (const stat of ['tov', 'oreb', 'dreb'] as const) {
      const shares = d.box[stat].drivers.map((x) => x.season.share ?? 0)
      expect(shares).toEqual([...shares].sort((a, b) => b - a)) // biggest share first
      for (const x of d.box[stat].drivers) expect(d.players[x.playerId]).toBeDefined()
    }
    // the test seed has LeBron on/off totals (32 min on, 0 off → never off the floor)
    expect(d.onOff).not.toBeNull()
    const lebron = d.onOff!.netRtg.find((x) => x.playerId === LEBRON_ID)!
    expect(lebron.minutesOn).toBeCloseTo(32, 6)
    expect(lebron.error).toMatch(/^Never off the floor/)
    expect(d.players[LEBRON_ID].name).toBe('LeBron James')
  })
})
