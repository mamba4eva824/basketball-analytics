import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/app/api/_lib/prisma'
import {
  successResponse,
  badRequest,
  serverError,
} from '@/app/api/_lib/response'
import { parseSearchParams, seasonSchema, conferenceSchema } from '@/app/api/_lib/validation'

const querySchema = z.object({
  season: seasonSchema.optional(),
  conference: conferenceSchema.optional(),
  asOfDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .optional(),
})

interface StandingTeam {
  id: string
  abbreviation: string
  name: string
  city: string
  nickname: string
  conference: string
  division: string
  logoUrl: string | null
  primaryColor: string | null
  secondaryColor: string | null
}

interface StandingRow {
  asOfDate: Date
  team: StandingTeam
  wins: number
  losses: number
  winPct: number
  gamesBehind: number
  streak: string | null
  lastTenWins: number | null
  lastTenLosses: number | null
  conferenceRank: number | null
  divisionRank: number | null
  leagueRank: number | null
  playoffSeed: number | null
  homeWins: number | null
  homeLosses: number | null
  awayWins: number | null
  awayLosses: number | null
  confWins: number | null
  confLosses: number | null
  divWins: number | null
  divLosses: number | null
  clinchStatus: string | null
  pointsFor: number | null
  pointsAgainst: number | null
  pointDiff: number | null
}

const standingInclude = {
  team: {
    select: {
      id: true,
      abbreviation: true,
      name: true,
      city: true,
      nickname: true,
      conference: true,
      division: true,
      logoUrl: true,
      primaryColor: true,
      secondaryColor: true,
    },
  },
} as const

export async function GET(request: NextRequest) {
  try {
    const parsed = parseSearchParams(request.nextUrl.searchParams, querySchema)
    if (!parsed.success) return badRequest(parsed.error)
    const { season, conference, asOfDate } = parsed.data

    // If no season specified, find the current season
    let seasonId = season
    if (!seasonId) {
      const currentSeason = await prisma.season.findFirst({
        where: { isCurrent: true },
        select: { id: true },
      })
      if (currentSeason) {
        seasonId = currentSeason.id
      }
    }

    let standings: StandingRow[]

    if (asOfDate) {
      // Exact date match
      const where: Record<string, unknown> = { asOfDate: new Date(asOfDate) }
      if (seasonId) where.season = seasonId

      standings = await prisma.standing.findMany({
        where,
        include: standingInclude,
        orderBy: { conferenceRank: 'asc' },
      }) as unknown as StandingRow[]
    } else if (seasonId) {
      // Find the latest snapshot date
      const latestSnapshot = await prisma.standing.findFirst({
        where: { season: seasonId },
        orderBy: { asOfDate: 'desc' },
        select: { asOfDate: true },
      })

      if (latestSnapshot) {
        standings = await prisma.standing.findMany({
          where: {
            season: seasonId,
            asOfDate: latestSnapshot.asOfDate,
          },
          include: standingInclude,
          orderBy: { conferenceRank: 'asc' },
        }) as unknown as StandingRow[]
      } else {
        standings = []
      }
    } else {
      standings = []
    }

    // Filter by conference if provided
    const filtered = conference
      ? standings.filter(
          (s: StandingRow) => s.team.conference === conference.toUpperCase(),
        )
      : standings

    // Group by conference for frontend convenience
    const east = filtered.filter((s: StandingRow) => s.team.conference === 'EAST')
    const west = filtered.filter((s: StandingRow) => s.team.conference === 'WEST')

    return successResponse({
      season: seasonId,
      asOfDate: standings.length > 0 ? standings[0].asOfDate : null,
      east: east.map(formatStanding),
      west: west.map(formatStanding),
    })
  } catch (err) {
    console.error('GET /api/standings error:', err)
    return serverError()
  }
}

function formatStanding(s: StandingRow) {
  return {
    team: s.team,
    wins: s.wins,
    losses: s.losses,
    winPct: s.winPct,
    gamesBehind: s.gamesBehind,
    streak: s.streak,
    lastTen: s.lastTenWins != null && s.lastTenLosses != null
      ? `${s.lastTenWins}-${s.lastTenLosses}`
      : null,
    conferenceRank: s.conferenceRank,
    divisionRank: s.divisionRank,
    leagueRank: s.leagueRank,
    playoffSeed: s.playoffSeed,
    home: s.homeWins != null && s.homeLosses != null
      ? `${s.homeWins}-${s.homeLosses}`
      : null,
    away: s.awayWins != null && s.awayLosses != null
      ? `${s.awayWins}-${s.awayLosses}`
      : null,
    conf: s.confWins != null && s.confLosses != null
      ? `${s.confWins}-${s.confLosses}`
      : null,
    div: s.divWins != null && s.divLosses != null
      ? `${s.divWins}-${s.divLosses}`
      : null,
    clinchStatus: s.clinchStatus,
    pointsFor: s.pointsFor,
    pointsAgainst: s.pointsAgainst,
    pointDiff: s.pointDiff,
  }
}
