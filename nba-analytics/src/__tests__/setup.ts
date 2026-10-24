/**
 * Shared test constants, helpers, and Prisma client for integration tests.
 *
 * - Constants (BASE_URL, LAKERS_ID, etc.) are used by API-level tests that hit
 *   the running dev server.
 * - The exported `prisma` instance and `resetDatabase()` helper are for tests
 *   that interact with the database directly.
 */

import { afterAll } from 'vitest'
import { PrismaClient } from '@/generated/prisma/client'

// ---------------------------------------------------------------------------
// Prisma client for direct DB access in tests
// ---------------------------------------------------------------------------

export const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
})

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

export const BASE_URL = 'http://localhost:4000'
export const LAKERS_ID = '1610612747'
export const CELTICS_ID = '1610612738'
export const LEBRON_ID = '2544'
export const SEASON = '2025-26'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Helper: fetch JSON from the API and return parsed body + status */
export async function apiFetch<T = unknown>(
  path: string,
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${BASE_URL}${path}`)
  const body = (await res.json()) as T
  return { status: res.status, body }
}

/**
 * Deletes all rows from every table in the correct order
 * (child tables first) so foreign-key constraints are respected.
 */
export async function resetDatabase() {
  await prisma.playerInjury.deleteMany()
  await prisma.scheduledGame.deleteMany()
  await prisma.shotChart.deleteMany()
  await prisma.lineupStats.deleteMany()
  await prisma.standing.deleteMany()
  await prisma.teamEfficiencySnapshot.deleteMany()
  await prisma.teamGameEfficiency.deleteMany()
  await prisma.teamSeasonStats.deleteMany()
  await prisma.playerSeasonStats.deleteMany()
  await prisma.playerGameLog.deleteMany()
  await prisma.gameBoxScore.deleteMany()
  await prisma.player.deleteMany()
  await prisma.team.deleteMany()
  await prisma.season.deleteMany()
}

// ---------------------------------------------------------------------------
// Global teardown
// ---------------------------------------------------------------------------

afterAll(async () => {
  await prisma.$disconnect()
})
