import { describe, test, expect } from 'vitest'
import { apiFetch, SEASON } from '../setup'

describe('GET /api/standings', () => {
  test('returns standings data', async () => {
    const { status, body } = await apiFetch<any>('/api/standings')

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toBeDefined()
  })

  test('response has season, asOfDate, east, and west arrays', async () => {
    const { body } = await apiFetch<any>('/api/standings')

    expect(body.data).toHaveProperty('season')
    expect(body.data).toHaveProperty('asOfDate')
    expect(body.data).toHaveProperty('east')
    expect(body.data).toHaveProperty('west')
    expect(Array.isArray(body.data.east)).toBe(true)
    expect(Array.isArray(body.data.west)).toBe(true)
  })

  test('supports season filter', async () => {
    const { body } = await apiFetch<any>(`/api/standings?season=${SEASON}`)

    expect(body.success).toBe(true)
    expect(body.data.season).toBe(SEASON)
  })

  test('supports conference filter (EAST)', async () => {
    const { body } = await apiFetch<any>('/api/standings?conference=EAST')

    expect(body.success).toBe(true)
    // When filtering by EAST, west array should be empty
    expect(body.data.east.length).toBeGreaterThanOrEqual(0)
    expect(body.data.west.length).toBe(0)
  })

  test('supports conference filter (WEST)', async () => {
    const { body } = await apiFetch<any>('/api/standings?conference=WEST')

    expect(body.success).toBe(true)
    // When filtering by WEST, east array should be empty
    expect(body.data.east.length).toBe(0)
    expect(body.data.west.length).toBeGreaterThanOrEqual(0)
  })

  test('standings include wins, losses, winPct', async () => {
    const { body } = await apiFetch<any>('/api/standings')

    const allStandings = [...body.data.east, ...body.data.west]
    if (allStandings.length > 0) {
      for (const s of allStandings.slice(0, 5)) {
        expect(s).toHaveProperty('wins')
        expect(s).toHaveProperty('losses')
        expect(s).toHaveProperty('winPct')
        expect(typeof s.wins).toBe('number')
        expect(typeof s.losses).toBe('number')
        expect(typeof s.winPct).toBe('number')
      }
    }
  })

  test('each standing entry has team object', async () => {
    const { body } = await apiFetch<any>('/api/standings')

    const allStandings = [...body.data.east, ...body.data.west]
    if (allStandings.length > 0) {
      for (const s of allStandings.slice(0, 5)) {
        expect(s).toHaveProperty('team')
        expect(s.team).toHaveProperty('id')
        expect(s.team).toHaveProperty('abbreviation')
        expect(s.team).toHaveProperty('name')
        expect(s.team).toHaveProperty('city')
        expect(s.team).toHaveProperty('nickname')
        expect(s.team).toHaveProperty('conference')
        expect(s.team).toHaveProperty('division')
      }
    }
  })

  test('standings include ranking fields', async () => {
    const { body } = await apiFetch<any>('/api/standings')

    const allStandings = [...body.data.east, ...body.data.west]
    if (allStandings.length > 0) {
      const s = allStandings[0]
      expect(s).toHaveProperty('conferenceRank')
      expect(s).toHaveProperty('divisionRank')
      expect(s).toHaveProperty('playoffSeed')
      expect(s).toHaveProperty('gamesBehind')
    }
  })

  test('standings include record breakdown fields', async () => {
    const { body } = await apiFetch<any>('/api/standings')

    const allStandings = [...body.data.east, ...body.data.west]
    if (allStandings.length > 0) {
      const s = allStandings[0]
      expect(s).toHaveProperty('streak')
      expect(s).toHaveProperty('lastTen')
      expect(s).toHaveProperty('home')
      expect(s).toHaveProperty('away')
      expect(s).toHaveProperty('conf')
      expect(s).toHaveProperty('div')
      expect(s).toHaveProperty('clinchStatus')
      expect(s).toHaveProperty('pointsFor')
      expect(s).toHaveProperty('pointsAgainst')
      expect(s).toHaveProperty('pointDiff')
    }
  })

  test('east teams all have conference EAST', async () => {
    const { body } = await apiFetch<any>('/api/standings')

    for (const s of body.data.east) {
      expect(s.team.conference).toBe('EAST')
    }
  })

  test('west teams all have conference WEST', async () => {
    const { body } = await apiFetch<any>('/api/standings')

    for (const s of body.data.west) {
      expect(s.team.conference).toBe('WEST')
    }
  })
})
