import { describe, test, expect } from 'vitest'
import { apiFetch, LEBRON_ID, SEASON } from '../setup'

describe('GET /api/players/:playerId/gamelog', () => {
  test('returns game log entries', async () => {
    const { status, body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/gamelog`,
    )

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.meta).toBeDefined()
    expect(body.meta).toHaveProperty('total')
    expect(body.meta).toHaveProperty('page')
    expect(body.meta).toHaveProperty('pageSize')
  })

  test('supports season filter', async () => {
    const { body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/gamelog?season=${SEASON}`,
    )

    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    // All entries should be for the specified season
    for (const entry of body.data) {
      expect(entry.season).toBe(SEASON)
    }
  })

  test('supports last N games filter', async () => {
    const { body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/gamelog?last=5`,
    )

    expect(body.success).toBe(true)
    expect(body.data.length).toBeLessThanOrEqual(5)
    // Meta should reflect the number returned
    expect(body.meta.total).toBe(body.data.length)
  })

  test('each entry has required fields (points, rebounds, assists, gameDate)', async () => {
    const { body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/gamelog?last=3`,
    )

    expect(body.data.length).toBeGreaterThan(0)
    for (const entry of body.data) {
      expect(entry).toHaveProperty('points')
      expect(entry).toHaveProperty('reboundsTotal')
      expect(entry).toHaveProperty('assists')
      expect(entry).toHaveProperty('gameDate')
      expect(typeof entry.points).toBe('number')
      expect(typeof entry.reboundsTotal).toBe('number')
      expect(typeof entry.assists).toBe('number')
    }
  })

  test('each entry has shooting stats', async () => {
    const { body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/gamelog?last=3`,
    )

    for (const entry of body.data) {
      expect(entry).toHaveProperty('fieldGoals')
      expect(entry).toHaveProperty('fieldGoalAtt')
      expect(entry).toHaveProperty('fieldGoalPct')
      expect(entry).toHaveProperty('threePointers')
      expect(entry).toHaveProperty('threePointAtt')
      expect(entry).toHaveProperty('threePointPct')
      expect(entry).toHaveProperty('freeThrows')
      expect(entry).toHaveProperty('freeThrowAtt')
      expect(entry).toHaveProperty('freeThrowPct')
    }
  })

  test('each entry has game context fields', async () => {
    const { body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/gamelog?last=3`,
    )

    for (const entry of body.data) {
      expect(entry).toHaveProperty('playerId')
      expect(entry).toHaveProperty('teamId')
      expect(entry).toHaveProperty('gameId')
      expect(entry).toHaveProperty('season')
      expect(entry).toHaveProperty('homeAway')
      expect(entry).toHaveProperty('result')
      expect(entry).toHaveProperty('minutes')
      expect(entry).toHaveProperty('plusMinus')
    }
  })

  test('each entry includes team sub-object', async () => {
    const { body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/gamelog?last=3`,
    )

    for (const entry of body.data) {
      expect(entry).toHaveProperty('team')
      expect(entry.team).toHaveProperty('id')
      expect(entry.team).toHaveProperty('abbreviation')
    }
  })

  test('returns 404 for invalid player ID', async () => {
    const { status, body } = await apiFetch<any>(
      '/api/players/9999999999/gamelog',
    )

    expect(status).toBe(404)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('NOT_FOUND')
  })

  test('supports pagination', async () => {
    const { body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/gamelog?page=1&pageSize=3`,
    )

    expect(body.success).toBe(true)
    expect(body.data.length).toBeLessThanOrEqual(3)
    expect(body.meta.page).toBe(1)
    expect(body.meta.pageSize).toBe(3)
  })
})
