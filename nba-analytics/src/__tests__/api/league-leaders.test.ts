import { describe, test, expect } from 'vitest'
import { apiFetch, SEASON } from '../setup'

describe('GET /api/league/leaders', () => {
  test('returns leaders data', async () => {
    const { status, body } = await apiFetch<any>(
      '/api/league/leaders?stat=pts',
    )

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.meta).toBeDefined()
    expect(body.meta).toHaveProperty('total')
    expect(body.meta).toHaveProperty('page')
    expect(body.meta).toHaveProperty('pageSize')
  })

  test('returns error when stat param is missing', async () => {
    const { status, body } = await apiFetch<any>('/api/league/leaders')

    expect(status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('BAD_REQUEST')
  })

  test('returns error for invalid stat', async () => {
    const { status, body } = await apiFetch<any>(
      '/api/league/leaders?stat=invalid_stat',
    )

    expect(status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('BAD_REQUEST')
  })

  test('supports stat param', async () => {
    const { body } = await apiFetch<any>(
      '/api/league/leaders?stat=pts',
    )

    expect(body.success).toBe(true)
    if (body.data.length > 0) {
      expect(body.data[0]).toHaveProperty('statName')
      expect(body.data[0].statName).toBe('pts')
      expect(body.data[0].statField).toBe('pointsPerGame')
    }
  })

  test('leaders are sorted by the requested stat (descending for pts)', async () => {
    const { body } = await apiFetch<any>(
      '/api/league/leaders?stat=pts&pageSize=10',
    )

    expect(body.success).toBe(true)
    if (body.data.length > 1) {
      for (let i = 0; i < body.data.length - 1; i++) {
        expect(body.data[i].statValue).toBeGreaterThanOrEqual(
          body.data[i + 1].statValue,
        )
      }
    }
  })

  test('each leader entry has rank', async () => {
    const { body } = await apiFetch<any>(
      '/api/league/leaders?stat=pts',
    )

    if (body.data.length > 0) {
      expect(body.data[0].rank).toBe(1)
      for (let i = 0; i < body.data.length; i++) {
        expect(body.data[i].rank).toBe(i + 1)
      }
    }
  })

  test('each leader entry has player and team info', async () => {
    const { body } = await apiFetch<any>(
      '/api/league/leaders?stat=pts',
    )

    if (body.data.length > 0) {
      const entry = body.data[0]
      expect(entry).toHaveProperty('player')
      expect(entry.player).toHaveProperty('id')
      expect(entry.player).toHaveProperty('fullName')
      expect(entry.player).toHaveProperty('position')
      expect(entry.player).toHaveProperty('headshotUrl')

      expect(entry).toHaveProperty('team')
      expect(entry.team).toHaveProperty('id')
      expect(entry.team).toHaveProperty('abbreviation')
      expect(entry.team).toHaveProperty('name')
      expect(entry.team).toHaveProperty('logoUrl')
    }
  })

  test('each leader entry has stat fields', async () => {
    const { body } = await apiFetch<any>(
      '/api/league/leaders?stat=pts',
    )

    if (body.data.length > 0) {
      const entry = body.data[0]
      expect(entry).toHaveProperty('season')
      expect(entry).toHaveProperty('gamesPlayed')
      expect(entry).toHaveProperty('statValue')
      expect(entry).toHaveProperty('statName')
      expect(entry).toHaveProperty('statField')
      expect(entry).toHaveProperty('pointsPerGame')
      expect(entry).toHaveProperty('reboundsPerGame')
      expect(entry).toHaveProperty('assistsPerGame')
      expect(entry).toHaveProperty('minutesPerGame')
      expect(typeof entry.gamesPlayed).toBe('number')
      expect(typeof entry.statValue).toBe('number')
    }
  })

  test('supports season filter', async () => {
    const { body } = await apiFetch<any>(
      `/api/league/leaders?stat=pts&season=${SEASON}`,
    )

    expect(body.success).toBe(true)
    if (body.data.length > 0) {
      expect(body.data[0].season).toBe(SEASON)
    }
  })

  test('supports pagination', async () => {
    const { body } = await apiFetch<any>(
      '/api/league/leaders?stat=pts&page=1&pageSize=5',
    )

    expect(body.success).toBe(true)
    expect(body.data.length).toBeLessThanOrEqual(5)
    expect(body.meta.page).toBe(1)
    expect(body.meta.pageSize).toBe(5)
  })

  test('supports minGames filter', async () => {
    const { body } = await apiFetch<any>(
      '/api/league/leaders?stat=pts&minGames=20',
    )

    expect(body.success).toBe(true)
    for (const entry of body.data) {
      expect(entry.gamesPlayed).toBeGreaterThanOrEqual(20)
    }
  })

  test('works with different stat types', async () => {
    const statTests = ['reb', 'ast', 'fg_pct', 'three_pct']

    for (const stat of statTests) {
      const { body } = await apiFetch<any>(
        `/api/league/leaders?stat=${stat}`,
      )
      expect(body.success).toBe(true)
      if (body.data.length > 0) {
        expect(body.data[0].statName).toBe(stat)
      }
    }
  })
})
