import { describe, test, expect } from 'vitest'
import { apiFetch, LAKERS_ID, LEBRON_ID } from '../setup'

describe('GET /api/players', () => {
  test('returns paginated list of players', async () => {
    const { status, body } = await apiFetch<any>('/api/players')

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBeGreaterThan(0)
    expect(body.meta).toBeDefined()
    expect(body.meta).toHaveProperty('total')
    expect(body.meta).toHaveProperty('page')
    expect(body.meta).toHaveProperty('pageSize')
    expect(body.meta.page).toBe(1)
    expect(body.meta.pageSize).toBe(25)
  })

  test('respects custom page and pageSize', async () => {
    const { body } = await apiFetch<any>('/api/players?page=2&pageSize=5')

    expect(body.success).toBe(true)
    expect(body.meta.page).toBe(2)
    expect(body.meta.pageSize).toBe(5)
    expect(body.data.length).toBeLessThanOrEqual(5)
  })

  test('supports teamId filter', async () => {
    const { body } = await apiFetch<any>(`/api/players?teamId=${LAKERS_ID}`)

    expect(body.success).toBe(true)
    expect(body.data.length).toBeGreaterThan(0)
    for (const player of body.data) {
      expect(player.teamId).toBe(LAKERS_ID)
    }
  })

  test('supports search filter', async () => {
    const { body } = await apiFetch<any>('/api/players?search=LeBron')

    expect(body.success).toBe(true)
    expect(body.data.length).toBeGreaterThanOrEqual(1)
    const lebron = body.data.find((p: any) => p.id === LEBRON_ID)
    expect(lebron).toBeDefined()
  })

  test('each player has expected fields', async () => {
    const { body } = await apiFetch<any>('/api/players?pageSize=5')

    for (const player of body.data) {
      expect(player).toHaveProperty('id')
      expect(player).toHaveProperty('firstName')
      expect(player).toHaveProperty('lastName')
      expect(player).toHaveProperty('fullName')
      expect(player).toHaveProperty('position')
      expect(player).toHaveProperty('jersey')
      expect(player).toHaveProperty('height')
      expect(player).toHaveProperty('weight')
      expect(player).toHaveProperty('isActive')
      expect(player).toHaveProperty('headshotUrl')
      expect(player).toHaveProperty('teamId')
    }
  })

  test('each player includes team object', async () => {
    const { body } = await apiFetch<any>('/api/players?pageSize=5')

    for (const player of body.data) {
      // team may be null if player has no team
      if (player.team) {
        expect(player.team).toHaveProperty('id')
        expect(player.team).toHaveProperty('abbreviation')
        expect(player.team).toHaveProperty('name')
        expect(player.team).toHaveProperty('logoUrl')
      }
    }
  })
})

describe('GET /api/players/:playerId', () => {
  test('returns player details for valid ID', async () => {
    const { status, body } = await apiFetch<any>(`/api/players/${LEBRON_ID}`)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toBeDefined()
    expect(body.data.id).toBe(LEBRON_ID)
  })

  test('returns 404 for invalid player ID', async () => {
    const { status, body } = await apiFetch<any>('/api/players/9999999999')

    expect(status).toBe(404)
    expect(body.success).toBe(false)
    expect(body.error).toBeDefined()
    expect(body.error.code).toBe('NOT_FOUND')
    expect(typeof body.error.message).toBe('string')
  })

  test('player has name, position, team info', async () => {
    const { body } = await apiFetch<any>(`/api/players/${LEBRON_ID}`)

    const player = body.data
    expect(player).toHaveProperty('firstName')
    expect(player).toHaveProperty('lastName')
    expect(player).toHaveProperty('fullName')
    expect(player).toHaveProperty('position')
    expect(player).toHaveProperty('teamId')
    expect(player).toHaveProperty('team')
    if (player.team) {
      expect(player.team).toHaveProperty('id')
      expect(player.team).toHaveProperty('abbreviation')
      expect(player.team).toHaveProperty('name')
      expect(player.team).toHaveProperty('logoUrl')
      expect(player.team).toHaveProperty('primaryColor')
    }
  })

  test('player includes biographical fields', async () => {
    const { body } = await apiFetch<any>(`/api/players/${LEBRON_ID}`)

    const player = body.data
    expect(player).toHaveProperty('height')
    expect(player).toHaveProperty('weight')
    expect(player).toHaveProperty('jersey')
    expect(player).toHaveProperty('isActive')
    expect(player).toHaveProperty('headshotUrl')
  })

  test('player includes playerSeasonStats array', async () => {
    const { body } = await apiFetch<any>(`/api/players/${LEBRON_ID}`)

    const player = body.data
    expect(player).toHaveProperty('playerSeasonStats')
    expect(Array.isArray(player.playerSeasonStats)).toBe(true)
  })

  test('playerSeasonStats entries have expected fields when present', async () => {
    const { body } = await apiFetch<any>(`/api/players/${LEBRON_ID}`)

    const stats = body.data.playerSeasonStats
    if (stats.length > 0) {
      const s = stats[0]
      expect(s).toHaveProperty('season')
      expect(s).toHaveProperty('teamId')
      expect(s).toHaveProperty('gamesPlayed')
      expect(s).toHaveProperty('gamesStarted')
      expect(s).toHaveProperty('minutesPerGame')
      expect(s).toHaveProperty('pointsPerGame')
      expect(s).toHaveProperty('reboundsPerGame')
      expect(s).toHaveProperty('assistsPerGame')
      expect(s).toHaveProperty('stealsPerGame')
      expect(s).toHaveProperty('blocksPerGame')
      expect(s).toHaveProperty('turnoversPerGame')
      expect(s).toHaveProperty('fieldGoalPct')
      expect(s).toHaveProperty('threePointPct')
      expect(s).toHaveProperty('freeThrowPct')
    }
  })
})
