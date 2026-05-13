import { describe, test, expect } from 'vitest'
import { apiFetch, LAKERS_ID } from '../setup'

describe('GET /api/teams', () => {
  test('returns list of teams with success shape', async () => {
    const { status, body } = await apiFetch<any>('/api/teams')

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body).toHaveProperty('data')
    expect(body).toHaveProperty('meta')
  })

  test('response has data array', async () => {
    const { body } = await apiFetch<any>('/api/teams')

    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBeGreaterThan(0)
  })

  test('each team has id, name, abbreviation, conference', async () => {
    const { body } = await apiFetch<any>('/api/teams')

    for (const team of body.data) {
      expect(team).toHaveProperty('id')
      expect(team).toHaveProperty('name')
      expect(team).toHaveProperty('abbreviation')
      expect(team).toHaveProperty('conference')
      expect(typeof team.id).toBe('string')
      expect(typeof team.name).toBe('string')
      expect(typeof team.abbreviation).toBe('string')
      expect(['EAST', 'WEST']).toContain(team.conference)
    }
  })

  test('each team has city, nickname, division, and color fields', async () => {
    const { body } = await apiFetch<any>('/api/teams')

    for (const team of body.data) {
      expect(team).toHaveProperty('city')
      expect(team).toHaveProperty('nickname')
      expect(team).toHaveProperty('division')
      expect(team).toHaveProperty('logoUrl')
      expect(team).toHaveProperty('primaryColor')
      expect(team).toHaveProperty('secondaryColor')
    }
  })

  test('meta includes total, page, pageSize', async () => {
    const { body } = await apiFetch<any>('/api/teams')

    expect(body.meta).toHaveProperty('total')
    expect(body.meta).toHaveProperty('page')
    expect(body.meta).toHaveProperty('pageSize')
    expect(typeof body.meta.total).toBe('number')
    expect(body.meta.total).toBeGreaterThan(0)
  })

  test('supports conference filter', async () => {
    const { body } = await apiFetch<any>('/api/teams?conference=EAST')

    expect(body.success).toBe(true)
    for (const team of body.data) {
      expect(team.conference).toBe('EAST')
    }
  })

  test('supports search filter', async () => {
    const { body } = await apiFetch<any>('/api/teams?search=Lakers')

    expect(body.success).toBe(true)
    expect(body.data.length).toBeGreaterThanOrEqual(1)
    const lakers = body.data.find((t: any) => t.abbreviation === 'LAL')
    expect(lakers).toBeDefined()
  })
})

describe('GET /api/teams/:teamId', () => {
  test('returns single team for valid ID', async () => {
    const { status, body } = await apiFetch<any>(`/api/teams/${LAKERS_ID}`)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toBeDefined()
    expect(body.data.id).toBe(LAKERS_ID)
  })

  test('returns 404 for invalid team ID', async () => {
    const { status, body } = await apiFetch<any>('/api/teams/9999999999')

    expect(status).toBe(404)
    expect(body.success).toBe(false)
    expect(body.error).toBeDefined()
    expect(body.error.code).toBe('NOT_FOUND')
    expect(typeof body.error.message).toBe('string')
  })

  test('team object has expected fields', async () => {
    const { body } = await apiFetch<any>(`/api/teams/${LAKERS_ID}`)

    const team = body.data
    expect(team).toHaveProperty('id')
    expect(team).toHaveProperty('abbreviation')
    expect(team).toHaveProperty('name')
    expect(team).toHaveProperty('city')
    expect(team).toHaveProperty('nickname')
    expect(team).toHaveProperty('conference')
    expect(team).toHaveProperty('division')
    expect(team).toHaveProperty('logoUrl')
    expect(team).toHaveProperty('primaryColor')
    expect(team).toHaveProperty('secondaryColor')
  })

  test('team includes teamSeasonStats array', async () => {
    const { body } = await apiFetch<any>(`/api/teams/${LAKERS_ID}`)

    const team = body.data
    expect(team).toHaveProperty('teamSeasonStats')
    expect(Array.isArray(team.teamSeasonStats)).toBe(true)
  })

  test('team includes standings array', async () => {
    const { body } = await apiFetch<any>(`/api/teams/${LAKERS_ID}`)

    const team = body.data
    expect(team).toHaveProperty('standings')
    expect(Array.isArray(team.standings)).toBe(true)
  })

  test('standings entries have expected fields when present', async () => {
    const { body } = await apiFetch<any>(`/api/teams/${LAKERS_ID}`)

    const standings = body.data.standings
    if (standings.length > 0) {
      const s = standings[0]
      expect(s).toHaveProperty('wins')
      expect(s).toHaveProperty('losses')
      expect(s).toHaveProperty('winPct')
      expect(s).toHaveProperty('conferenceRank')
      expect(s).toHaveProperty('divisionRank')
      expect(s).toHaveProperty('streak')
      expect(s).toHaveProperty('playoffSeed')
      expect(s).toHaveProperty('clinchStatus')
    }
  })
})
