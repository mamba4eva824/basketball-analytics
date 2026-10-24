/**
 * Test database seed script.
 *
 * Seeds minimal, realistic data for all 12 Prisma models so that integration
 * tests can run against a populated database.
 *
 * Usage:
 *   npx tsx scripts/seed-test-data.ts
 *
 * Requires DATABASE_URL to be set in the environment (or in .env via dotenv).
 */

import 'dotenv/config'
import { PrismaClient, ShotResult, ShotType, HomeAway, WinLoss, Conference, Division } from '../src/generated/prisma/client'

const prisma = new PrismaClient()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg: string) {
  console.log(`[seed] ${msg}`)
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LAKERS_ID = '1610612747'
const CELTICS_ID = '1610612738'

const SEASON_ID = '2025-26'

const LEBRON_ID = '2544'
const AD_ID = '203076'
const TATUM_ID = '1628369'
const BROWN_ID = '1627759'

const GAME1_ID = '0022400512' // Lakers home
const GAME2_ID = '0022400789' // Celtics home

const GAME1_DATE = new Date('2026-01-15')
const GAME2_DATE = new Date('2026-02-20')

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  log('Clearing existing data (child tables first)...')

  // Delete in reverse-dependency order
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

  log('All tables cleared.')

  // ------------------------------------------------------------------
  // 1. Teams
  // ------------------------------------------------------------------
  log('Seeding teams...')

  await prisma.team.createMany({
    data: [
      {
        id: LAKERS_ID,
        abbreviation: 'LAL',
        name: 'Los Angeles Lakers',
        city: 'Los Angeles',
        nickname: 'Lakers',
        conference: Conference.WEST,
        division: Division.PACIFIC,
        primaryColor: '#552583',
        secondaryColor: '#FDB927',
      },
      {
        id: CELTICS_ID,
        abbreviation: 'BOS',
        name: 'Boston Celtics',
        city: 'Boston',
        nickname: 'Celtics',
        conference: Conference.EAST,
        division: Division.ATLANTIC,
        primaryColor: '#007A33',
        secondaryColor: '#BA9653',
      },
    ],
  })

  // ------------------------------------------------------------------
  // 2. Season
  // ------------------------------------------------------------------
  log('Seeding season...')

  await prisma.season.create({
    data: {
      id: SEASON_ID,
      startYear: 2025,
      endYear: 2026,
      displayName: '2025-26 Season',
      startDate: new Date('2025-10-21'),
      endDate: new Date('2026-06-21'),
      isCurrent: true,
    },
  })

  // ------------------------------------------------------------------
  // 3. Players
  // ------------------------------------------------------------------
  log('Seeding players...')

  await prisma.player.createMany({
    data: [
      {
        id: LEBRON_ID,
        firstName: 'LeBron',
        lastName: 'James',
        fullName: 'LeBron James',
        birthDate: new Date('1984-12-30'),
        height: '6-9',
        weight: 250,
        position: 'F',
        jersey: '23',
        isActive: true,
        fromYear: 2003,
        toYear: 2025,
        draftYear: 2003,
        draftRound: 1,
        draftPick: 1,
        country: 'USA',
        school: 'St. Vincent-St. Mary HS',
        teamId: LAKERS_ID,
      },
      {
        id: AD_ID,
        firstName: 'Anthony',
        lastName: 'Davis',
        fullName: 'Anthony Davis',
        birthDate: new Date('1993-03-11'),
        height: '6-10',
        weight: 253,
        position: 'F-C',
        jersey: '3',
        isActive: true,
        fromYear: 2012,
        toYear: 2025,
        draftYear: 2012,
        draftRound: 1,
        draftPick: 1,
        country: 'USA',
        school: 'Kentucky',
        teamId: LAKERS_ID,
      },
      {
        id: TATUM_ID,
        firstName: 'Jayson',
        lastName: 'Tatum',
        fullName: 'Jayson Tatum',
        birthDate: new Date('1998-03-03'),
        height: '6-8',
        weight: 210,
        position: 'F',
        jersey: '0',
        isActive: true,
        fromYear: 2017,
        toYear: 2025,
        draftYear: 2017,
        draftRound: 1,
        draftPick: 3,
        country: 'USA',
        school: 'Duke',
        teamId: CELTICS_ID,
      },
      {
        id: BROWN_ID,
        firstName: 'Jaylen',
        lastName: 'Brown',
        fullName: 'Jaylen Brown',
        birthDate: new Date('1996-10-24'),
        height: '6-6',
        weight: 223,
        position: 'G-F',
        jersey: '7',
        isActive: true,
        fromYear: 2016,
        toYear: 2025,
        draftYear: 2016,
        draftRound: 1,
        draftPick: 3,
        country: 'USA',
        school: 'California',
        teamId: CELTICS_ID,
      },
    ],
  })

  // ------------------------------------------------------------------
  // 4. GameBoxScores
  // ------------------------------------------------------------------
  log('Seeding game box scores...')

  // Game 1: Lakers (home) beat Celtics 115-108
  await prisma.gameBoxScore.create({
    data: {
      gameId: GAME1_ID,
      gameDate: GAME1_DATE,
      season: SEASON_ID,
      seasonId: SEASON_ID,
      homeTeamId: LAKERS_ID,
      awayTeamId: CELTICS_ID,
      // Home (Lakers) stats
      homePoints: 115,
      homeFieldGoals: 43,
      homeFieldGoalAtt: 89,
      homeFieldGoalPct: 0.483,
      homeThreePointers: 12,
      homeThreePointAtt: 33,
      homeThreePointPct: 0.364,
      homeFreeThrows: 17,
      homeFreeThrowAtt: 21,
      homeFreeThrowPct: 0.81,
      homeReboundsOff: 10,
      homeReboundsDef: 34,
      homeReboundsTotal: 44,
      homeAssists: 27,
      homeSteals: 8,
      homeBlocks: 5,
      homeTurnovers: 12,
      homePersonalFouls: 19,
      homeFastBreakPts: 18,
      homePtsInPaint: 52,
      homePtsOffTurnovers: 15,
      homeSecondChancePts: 12,
      // Away (Celtics) stats
      awayPoints: 108,
      awayFieldGoals: 40,
      awayFieldGoalAtt: 91,
      awayFieldGoalPct: 0.44,
      awayThreePointers: 14,
      awayThreePointAtt: 40,
      awayThreePointPct: 0.35,
      awayFreeThrows: 14,
      awayFreeThrowAtt: 18,
      awayFreeThrowPct: 0.778,
      awayReboundsOff: 9,
      awayReboundsDef: 31,
      awayReboundsTotal: 40,
      awayAssists: 25,
      awaySteals: 6,
      awayBlocks: 4,
      awayTurnovers: 14,
      awayPersonalFouls: 20,
      awayFastBreakPts: 14,
      awayPtsInPaint: 46,
      awayPtsOffTurnovers: 18,
      awaySecondChancePts: 10,
      arena: 'Crypto.com Arena',
      attendance: 18997,
    },
  })

  // Game 2: Celtics (home) beat Lakers 121-109
  await prisma.gameBoxScore.create({
    data: {
      gameId: GAME2_ID,
      gameDate: GAME2_DATE,
      season: SEASON_ID,
      seasonId: SEASON_ID,
      homeTeamId: CELTICS_ID,
      awayTeamId: LAKERS_ID,
      // Home (Celtics) stats
      homePoints: 121,
      homeFieldGoals: 46,
      homeFieldGoalAtt: 90,
      homeFieldGoalPct: 0.511,
      homeThreePointers: 17,
      homeThreePointAtt: 42,
      homeThreePointPct: 0.405,
      homeFreeThrows: 12,
      homeFreeThrowAtt: 15,
      homeFreeThrowPct: 0.8,
      homeReboundsOff: 11,
      homeReboundsDef: 35,
      homeReboundsTotal: 46,
      homeAssists: 30,
      homeSteals: 9,
      homeBlocks: 6,
      homeTurnovers: 10,
      homePersonalFouls: 18,
      homeFastBreakPts: 20,
      homePtsInPaint: 50,
      homePtsOffTurnovers: 16,
      homeSecondChancePts: 14,
      // Away (Lakers) stats
      awayPoints: 109,
      awayFieldGoals: 41,
      awayFieldGoalAtt: 92,
      awayFieldGoalPct: 0.446,
      awayThreePointers: 11,
      awayThreePointAtt: 35,
      awayThreePointPct: 0.314,
      awayFreeThrows: 16,
      awayFreeThrowAtt: 20,
      awayFreeThrowPct: 0.8,
      awayReboundsOff: 8,
      awayReboundsDef: 32,
      awayReboundsTotal: 40,
      awayAssists: 24,
      awaySteals: 5,
      awayBlocks: 3,
      awayTurnovers: 15,
      awayPersonalFouls: 17,
      awayFastBreakPts: 12,
      awayPtsInPaint: 48,
      awayPtsOffTurnovers: 14,
      awaySecondChancePts: 8,
      arena: 'TD Garden',
      attendance: 19156,
    },
  })

  // ------------------------------------------------------------------
  // 5. PlayerGameLogs (8 total: 4 players x 2 games)
  // ------------------------------------------------------------------
  log('Seeding player game logs...')

  // Game 1: Lakers HOME win 115-108
  await prisma.playerGameLog.createMany({
    data: [
      // LeBron — Game 1
      {
        playerId: LEBRON_ID,
        teamId: LAKERS_ID,
        gameId: GAME1_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        gameDate: GAME1_DATE,
        homeAway: HomeAway.HOME,
        result: WinLoss.W,
        minutes: 36.5,
        minutesStr: '36:30',
        points: 28,
        fieldGoals: 10,
        fieldGoalAtt: 21,
        fieldGoalPct: 0.476,
        threePointers: 3,
        threePointAtt: 8,
        threePointPct: 0.375,
        freeThrows: 5,
        freeThrowAtt: 6,
        freeThrowPct: 0.833,
        reboundsOff: 1,
        reboundsDef: 7,
        reboundsTotal: 8,
        assists: 9,
        steals: 2,
        blocks: 1,
        turnovers: 3,
        personalFouls: 2,
        plusMinus: 12.0,
        offRating: 118.5,
        defRating: 106.2,
        netRating: 12.3,
        trueShootingPct: 0.598,
        effectiveFgPct: 0.548,
        usageRate: 0.29,
        started: true,
      },
      // Anthony Davis — Game 1
      {
        playerId: AD_ID,
        teamId: LAKERS_ID,
        gameId: GAME1_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        gameDate: GAME1_DATE,
        homeAway: HomeAway.HOME,
        result: WinLoss.W,
        minutes: 37.0,
        minutesStr: '37:00',
        points: 26,
        fieldGoals: 11,
        fieldGoalAtt: 20,
        fieldGoalPct: 0.55,
        threePointers: 1,
        threePointAtt: 3,
        threePointPct: 0.333,
        freeThrows: 3,
        freeThrowAtt: 4,
        freeThrowPct: 0.75,
        reboundsOff: 3,
        reboundsDef: 9,
        reboundsTotal: 12,
        assists: 3,
        steals: 1,
        blocks: 3,
        turnovers: 2,
        personalFouls: 3,
        plusMinus: 10.0,
        offRating: 116.0,
        defRating: 104.5,
        netRating: 11.5,
        trueShootingPct: 0.605,
        effectiveFgPct: 0.575,
        usageRate: 0.26,
        started: true,
      },
      // Jayson Tatum — Game 1
      {
        playerId: TATUM_ID,
        teamId: CELTICS_ID,
        gameId: GAME1_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        gameDate: GAME1_DATE,
        homeAway: HomeAway.AWAY,
        result: WinLoss.L,
        minutes: 38.2,
        minutesStr: '38:12',
        points: 30,
        fieldGoals: 11,
        fieldGoalAtt: 24,
        fieldGoalPct: 0.458,
        threePointers: 4,
        threePointAtt: 10,
        threePointPct: 0.4,
        freeThrows: 4,
        freeThrowAtt: 5,
        freeThrowPct: 0.8,
        reboundsOff: 1,
        reboundsDef: 6,
        reboundsTotal: 7,
        assists: 6,
        steals: 1,
        blocks: 1,
        turnovers: 4,
        personalFouls: 3,
        plusMinus: -8.0,
        offRating: 108.3,
        defRating: 116.8,
        netRating: -8.5,
        trueShootingPct: 0.577,
        effectiveFgPct: 0.542,
        usageRate: 0.31,
        started: true,
      },
      // Jaylen Brown — Game 1
      {
        playerId: BROWN_ID,
        teamId: CELTICS_ID,
        gameId: GAME1_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        gameDate: GAME1_DATE,
        homeAway: HomeAway.AWAY,
        result: WinLoss.L,
        minutes: 35.8,
        minutesStr: '35:48',
        points: 22,
        fieldGoals: 9,
        fieldGoalAtt: 20,
        fieldGoalPct: 0.45,
        threePointers: 2,
        threePointAtt: 7,
        threePointPct: 0.286,
        freeThrows: 2,
        freeThrowAtt: 3,
        freeThrowPct: 0.667,
        reboundsOff: 1,
        reboundsDef: 4,
        reboundsTotal: 5,
        assists: 4,
        steals: 2,
        blocks: 0,
        turnovers: 3,
        personalFouls: 4,
        plusMinus: -6.0,
        offRating: 106.1,
        defRating: 114.7,
        netRating: -8.6,
        trueShootingPct: 0.524,
        effectiveFgPct: 0.5,
        usageRate: 0.27,
        started: true,
      },
    ],
  })

  // Game 2: Celtics HOME win 121-109
  await prisma.playerGameLog.createMany({
    data: [
      // LeBron — Game 2
      {
        playerId: LEBRON_ID,
        teamId: LAKERS_ID,
        gameId: GAME2_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        gameDate: GAME2_DATE,
        homeAway: HomeAway.AWAY,
        result: WinLoss.L,
        minutes: 35.0,
        minutesStr: '35:00',
        points: 24,
        fieldGoals: 9,
        fieldGoalAtt: 22,
        fieldGoalPct: 0.409,
        threePointers: 2,
        threePointAtt: 7,
        threePointPct: 0.286,
        freeThrows: 4,
        freeThrowAtt: 5,
        freeThrowPct: 0.8,
        reboundsOff: 0,
        reboundsDef: 6,
        reboundsTotal: 6,
        assists: 7,
        steals: 1,
        blocks: 0,
        turnovers: 4,
        personalFouls: 2,
        plusMinus: -10.0,
        offRating: 105.2,
        defRating: 117.8,
        netRating: -12.6,
        trueShootingPct: 0.527,
        effectiveFgPct: 0.455,
        usageRate: 0.30,
        started: true,
      },
      // Anthony Davis — Game 2
      {
        playerId: AD_ID,
        teamId: LAKERS_ID,
        gameId: GAME2_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        gameDate: GAME2_DATE,
        homeAway: HomeAway.AWAY,
        result: WinLoss.L,
        minutes: 36.0,
        minutesStr: '36:00',
        points: 22,
        fieldGoals: 9,
        fieldGoalAtt: 19,
        fieldGoalPct: 0.474,
        threePointers: 0,
        threePointAtt: 2,
        threePointPct: 0.0,
        freeThrows: 4,
        freeThrowAtt: 6,
        freeThrowPct: 0.667,
        reboundsOff: 4,
        reboundsDef: 7,
        reboundsTotal: 11,
        assists: 2,
        steals: 1,
        blocks: 2,
        turnovers: 3,
        personalFouls: 4,
        plusMinus: -8.0,
        offRating: 107.1,
        defRating: 119.4,
        netRating: -12.3,
        trueShootingPct: 0.546,
        effectiveFgPct: 0.474,
        usageRate: 0.25,
        started: true,
      },
      // Jayson Tatum — Game 2
      {
        playerId: TATUM_ID,
        teamId: CELTICS_ID,
        gameId: GAME2_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        gameDate: GAME2_DATE,
        homeAway: HomeAway.HOME,
        result: WinLoss.W,
        minutes: 36.5,
        minutesStr: '36:30',
        points: 32,
        fieldGoals: 12,
        fieldGoalAtt: 23,
        fieldGoalPct: 0.522,
        threePointers: 5,
        threePointAtt: 11,
        threePointPct: 0.455,
        freeThrows: 3,
        freeThrowAtt: 4,
        freeThrowPct: 0.75,
        reboundsOff: 0,
        reboundsDef: 8,
        reboundsTotal: 8,
        assists: 8,
        steals: 2,
        blocks: 1,
        turnovers: 2,
        personalFouls: 2,
        plusMinus: 14.0,
        offRating: 122.4,
        defRating: 108.1,
        netRating: 14.3,
        trueShootingPct: 0.639,
        effectiveFgPct: 0.63,
        usageRate: 0.30,
        started: true,
      },
      // Jaylen Brown — Game 2
      {
        playerId: BROWN_ID,
        teamId: CELTICS_ID,
        gameId: GAME2_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        gameDate: GAME2_DATE,
        homeAway: HomeAway.HOME,
        result: WinLoss.W,
        minutes: 34.0,
        minutesStr: '34:00',
        points: 26,
        fieldGoals: 10,
        fieldGoalAtt: 19,
        fieldGoalPct: 0.526,
        threePointers: 3,
        threePointAtt: 8,
        threePointPct: 0.375,
        freeThrows: 3,
        freeThrowAtt: 4,
        freeThrowPct: 0.75,
        reboundsOff: 2,
        reboundsDef: 4,
        reboundsTotal: 6,
        assists: 5,
        steals: 3,
        blocks: 1,
        turnovers: 2,
        personalFouls: 3,
        plusMinus: 12.0,
        offRating: 120.3,
        defRating: 109.5,
        netRating: 10.8,
        trueShootingPct: 0.618,
        effectiveFgPct: 0.605,
        usageRate: 0.27,
        started: true,
      },
    ],
  })

  // ------------------------------------------------------------------
  // 6. PlayerSeasonStats (4 players)
  // ------------------------------------------------------------------
  log('Seeding player season stats...')

  await prisma.playerSeasonStats.createMany({
    data: [
      {
        playerId: LEBRON_ID,
        teamId: LAKERS_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        gamesPlayed: 55,
        gamesStarted: 55,
        minutesPerGame: 35.2,
        pointsPerGame: 25.7,
        fieldGoalsPerGame: 9.5,
        fieldGoalAttPerGame: 19.8,
        fieldGoalPct: 0.48,
        threePointersPerGame: 2.5,
        threePointAttPerGame: 6.8,
        threePointPct: 0.368,
        freeThrowsPerGame: 4.2,
        freeThrowAttPerGame: 5.5,
        freeThrowPct: 0.764,
        reboundsOffPerGame: 1.0,
        reboundsDefPerGame: 6.5,
        reboundsPerGame: 7.5,
        assistsPerGame: 8.3,
        stealsPerGame: 1.3,
        blocksPerGame: 0.6,
        turnoversPerGame: 3.5,
        foulsPerGame: 1.8,
        plusMinusPerGame: 4.2,
        totalPoints: 1414,
        totalRebounds: 413,
        totalAssists: 457,
        totalSteals: 72,
        totalBlocks: 33,
        totalTurnovers: 193,
        trueShootingPct: 0.583,
        effectiveFgPct: 0.543,
        usageRate: 0.296,
        assistPct: 0.38,
        reboundPct: 0.115,
        offRating: 116.5,
        defRating: 110.8,
        netRating: 5.7,
        per: 26.2,
        winShares: 8.4,
        boxPlusMinus: 7.1,
        vorp: 4.8,
      },
      {
        playerId: AD_ID,
        teamId: LAKERS_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        gamesPlayed: 52,
        gamesStarted: 52,
        minutesPerGame: 34.8,
        pointsPerGame: 24.1,
        fieldGoalsPerGame: 9.2,
        fieldGoalAttPerGame: 18.1,
        fieldGoalPct: 0.508,
        threePointersPerGame: 0.8,
        threePointAttPerGame: 2.5,
        threePointPct: 0.32,
        freeThrowsPerGame: 4.9,
        freeThrowAttPerGame: 6.2,
        freeThrowPct: 0.79,
        reboundsOffPerGame: 2.8,
        reboundsDefPerGame: 8.8,
        reboundsPerGame: 11.6,
        assistsPerGame: 3.2,
        stealsPerGame: 1.2,
        blocksPerGame: 2.2,
        turnoversPerGame: 2.1,
        foulsPerGame: 2.5,
        plusMinusPerGame: 5.0,
        totalPoints: 1253,
        totalRebounds: 603,
        totalAssists: 166,
        totalSteals: 62,
        totalBlocks: 114,
        totalTurnovers: 109,
        trueShootingPct: 0.608,
        effectiveFgPct: 0.53,
        usageRate: 0.268,
        assistPct: 0.17,
        reboundPct: 0.18,
        offRating: 117.2,
        defRating: 108.4,
        netRating: 8.8,
        per: 28.5,
        winShares: 9.1,
        boxPlusMinus: 6.8,
        vorp: 4.3,
      },
      {
        playerId: TATUM_ID,
        teamId: CELTICS_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        gamesPlayed: 58,
        gamesStarted: 58,
        minutesPerGame: 36.1,
        pointsPerGame: 27.2,
        fieldGoalsPerGame: 9.8,
        fieldGoalAttPerGame: 21.0,
        fieldGoalPct: 0.467,
        threePointersPerGame: 3.2,
        threePointAttPerGame: 8.8,
        threePointPct: 0.364,
        freeThrowsPerGame: 4.4,
        freeThrowAttPerGame: 5.3,
        freeThrowPct: 0.83,
        reboundsOffPerGame: 1.0,
        reboundsDefPerGame: 7.2,
        reboundsPerGame: 8.2,
        assistsPerGame: 5.1,
        stealsPerGame: 1.1,
        blocksPerGame: 0.7,
        turnoversPerGame: 2.8,
        foulsPerGame: 2.2,
        plusMinusPerGame: 8.3,
        totalPoints: 1578,
        totalRebounds: 476,
        totalAssists: 296,
        totalSteals: 64,
        totalBlocks: 41,
        totalTurnovers: 162,
        trueShootingPct: 0.596,
        effectiveFgPct: 0.543,
        usageRate: 0.306,
        assistPct: 0.25,
        reboundPct: 0.125,
        offRating: 121.0,
        defRating: 109.2,
        netRating: 11.8,
        per: 25.8,
        winShares: 10.2,
        boxPlusMinus: 7.5,
        vorp: 5.2,
      },
      {
        playerId: BROWN_ID,
        teamId: CELTICS_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        gamesPlayed: 56,
        gamesStarted: 56,
        minutesPerGame: 34.5,
        pointsPerGame: 23.8,
        fieldGoalsPerGame: 8.9,
        fieldGoalAttPerGame: 18.5,
        fieldGoalPct: 0.481,
        threePointersPerGame: 2.4,
        threePointAttPerGame: 6.2,
        threePointPct: 0.387,
        freeThrowsPerGame: 3.6,
        freeThrowAttPerGame: 4.5,
        freeThrowPct: 0.8,
        reboundsOffPerGame: 1.2,
        reboundsDefPerGame: 4.3,
        reboundsPerGame: 5.5,
        assistsPerGame: 3.8,
        stealsPerGame: 1.2,
        blocksPerGame: 0.5,
        turnoversPerGame: 2.4,
        foulsPerGame: 2.8,
        plusMinusPerGame: 6.5,
        totalPoints: 1333,
        totalRebounds: 308,
        totalAssists: 213,
        totalSteals: 67,
        totalBlocks: 28,
        totalTurnovers: 134,
        trueShootingPct: 0.589,
        effectiveFgPct: 0.546,
        usageRate: 0.274,
        assistPct: 0.2,
        reboundPct: 0.088,
        offRating: 119.8,
        defRating: 110.3,
        netRating: 9.5,
        per: 21.4,
        winShares: 7.8,
        boxPlusMinus: 4.2,
        vorp: 3.1,
      },
    ],
  })

  // ------------------------------------------------------------------
  // 7. TeamSeasonStats (2 teams)
  // ------------------------------------------------------------------
  log('Seeding team season stats...')

  await prisma.teamSeasonStats.createMany({
    data: [
      {
        teamId: LAKERS_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        gamesPlayed: 55,
        wins: 32,
        losses: 23,
        winPct: 0.582,
        pointsPerGame: 114.2,
        oppPointsPerGame: 110.8,
        fieldGoalPct: 0.478,
        threePointPct: 0.361,
        freeThrowPct: 0.775,
        reboundsPerGame: 44.5,
        assistsPerGame: 26.8,
        stealsPerGame: 7.9,
        blocksPerGame: 5.2,
        turnoversPerGame: 13.5,
        offRating: 115.4,
        defRating: 112.0,
        netRating: 3.4,
        pace: 99.2,
        effectiveFgPct: 0.532,
        trueShootingPct: 0.577,
        turnoverPct: 0.135,
        offReboundPct: 0.265,
        freeThrowRate: 0.245,
        oppEffectiveFgPct: 0.518,
        oppTurnoverPct: 0.128,
        oppFreeThrowRate: 0.231,
        fastBreakPtsPerGame: 15.2,
        ptsInPaintPerGame: 50.8,
        ptsOffTurnoversPerGame: 16.3,
        secondChancePtsPerGame: 11.5,
      },
      {
        teamId: CELTICS_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        gamesPlayed: 56,
        wins: 40,
        losses: 16,
        winPct: 0.714,
        pointsPerGame: 118.5,
        oppPointsPerGame: 108.2,
        fieldGoalPct: 0.488,
        threePointPct: 0.382,
        freeThrowPct: 0.805,
        reboundsPerGame: 45.2,
        assistsPerGame: 27.5,
        stealsPerGame: 7.2,
        blocksPerGame: 5.8,
        turnoversPerGame: 12.1,
        offRating: 120.8,
        defRating: 110.3,
        netRating: 10.5,
        pace: 98.1,
        effectiveFgPct: 0.556,
        trueShootingPct: 0.601,
        turnoverPct: 0.121,
        offReboundPct: 0.258,
        freeThrowRate: 0.228,
        oppEffectiveFgPct: 0.505,
        oppTurnoverPct: 0.135,
        oppFreeThrowRate: 0.22,
        fastBreakPtsPerGame: 17.1,
        ptsInPaintPerGame: 48.3,
        ptsOffTurnoversPerGame: 17.8,
        secondChancePtsPerGame: 12.2,
      },
    ],
  })

  // ------------------------------------------------------------------
  // 8. TeamGameEfficiency (2 records — Lakers for each game)
  // ------------------------------------------------------------------
  log('Seeding team game efficiency...')

  await prisma.teamGameEfficiency.createMany({
    data: [
      {
        teamId: LAKERS_ID,
        gameId: GAME1_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        gameDate: GAME1_DATE,
        offRating: 117.3,
        defRating: 110.2,
        netRating: 7.1,
        pace: 98.3,
        possessions: 98.3,
        result: WinLoss.W,
        homeAway: HomeAway.HOME,
      },
      {
        teamId: LAKERS_ID,
        gameId: GAME2_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        gameDate: GAME2_DATE,
        offRating: 108.5,
        defRating: 120.4,
        netRating: -11.9,
        pace: 100.4,
        possessions: 100.4,
        result: WinLoss.L,
        homeAway: HomeAway.AWAY,
      },
    ],
  })

  // ------------------------------------------------------------------
  // 9. TeamEfficiencySnapshot (2 records — Lakers L5 and Season)
  // ------------------------------------------------------------------
  log('Seeding team efficiency snapshots...')

  const snapshotDate = new Date('2026-02-21')

  await prisma.teamEfficiencySnapshot.createMany({
    data: [
      {
        teamId: LAKERS_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        window: 'L5',
        snapshotDate,
        offRating: 112.8,
        defRating: 114.1,
        netRating: -1.3,
        pace: 99.5,
        wins: 3,
        losses: 2,
        winPct: 0.6,
        effectiveFgPct: 0.525,
        turnoverPct: 0.14,
        offReboundPct: 0.27,
        freeThrowRate: 0.25,
        oppEffectiveFgPct: 0.53,
        oppTurnoverPct: 0.12,
        oppOffReboundPct: 0.24,
        oppFreeThrowRate: 0.23,
      },
      {
        teamId: LAKERS_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        window: 'Season',
        snapshotDate,
        offRating: 115.4,
        defRating: 112.0,
        netRating: 3.4,
        pace: 99.2,
        wins: 32,
        losses: 23,
        winPct: 0.582,
        effectiveFgPct: 0.532,
        turnoverPct: 0.135,
        offReboundPct: 0.265,
        freeThrowRate: 0.245,
        oppEffectiveFgPct: 0.518,
        oppTurnoverPct: 0.128,
        oppOffReboundPct: 0.255,
        oppFreeThrowRate: 0.231,
      },
    ],
  })

  // ------------------------------------------------------------------
  // 10. ShotChart (10 shots for LeBron in Game 1)
  // ------------------------------------------------------------------
  log('Seeding shot chart data...')

  await prisma.shotChart.createMany({
    data: [
      // 1. Driving layup — restricted area — MADE
      {
        playerId: LEBRON_ID,
        teamId: LAKERS_ID,
        gameId: GAME1_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        locX: -8.0,
        locY: 12.0,
        shotZone: 'Restricted Area',
        shotZoneArea: 'Center(C)',
        shotZoneRange: 'Less Than 8 ft.',
        shotDistance: 2,
        shotType: ShotType.TWO_POINTER,
        shotResult: ShotResult.MADE,
        actionType: 'Driving Layup',
        period: 1,
        gameClock: '9:45',
        shotValue: 2,
      },
      // 2. Mid-range pull-up — MADE
      {
        playerId: LEBRON_ID,
        teamId: LAKERS_ID,
        gameId: GAME1_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        locX: 82.0,
        locY: 90.0,
        shotZone: 'Mid-Range',
        shotZoneArea: 'Right Side Center(RC)',
        shotZoneRange: '8-16 ft.',
        shotDistance: 12,
        shotType: ShotType.TWO_POINTER,
        shotResult: ShotResult.MADE,
        actionType: 'Pull-Up Jump Shot',
        period: 1,
        gameClock: '5:22',
        shotValue: 2,
      },
      // 3. Three-pointer above the break — MADE
      {
        playerId: LEBRON_ID,
        teamId: LAKERS_ID,
        gameId: GAME1_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        locX: -15.0,
        locY: 245.0,
        shotZone: 'Above the Break 3',
        shotZoneArea: 'Center(C)',
        shotZoneRange: '24+ ft.',
        shotDistance: 25,
        shotType: ShotType.THREE_POINTER,
        shotResult: ShotResult.MADE,
        actionType: 'Step Back Jump Shot',
        period: 1,
        gameClock: '1:10',
        shotValue: 3,
      },
      // 4. Dunk — restricted area — MADE
      {
        playerId: LEBRON_ID,
        teamId: LAKERS_ID,
        gameId: GAME1_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        locX: 0.0,
        locY: 5.0,
        shotZone: 'Restricted Area',
        shotZoneArea: 'Center(C)',
        shotZoneRange: 'Less Than 8 ft.',
        shotDistance: 1,
        shotType: ShotType.TWO_POINTER,
        shotResult: ShotResult.MADE,
        actionType: 'Dunk',
        period: 2,
        gameClock: '8:30',
        shotValue: 2,
      },
      // 5. Corner three — left — MISSED
      {
        playerId: LEBRON_ID,
        teamId: LAKERS_ID,
        gameId: GAME1_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        locX: -220.0,
        locY: 30.0,
        shotZone: 'Left Corner 3',
        shotZoneArea: 'Left Side(L)',
        shotZoneRange: '24+ ft.',
        shotDistance: 23,
        shotType: ShotType.THREE_POINTER,
        shotResult: ShotResult.MISSED,
        actionType: 'Jump Shot',
        period: 2,
        gameClock: '3:15',
        shotValue: 3,
      },
      // 6. Fadeaway mid-range — MADE
      {
        playerId: LEBRON_ID,
        teamId: LAKERS_ID,
        gameId: GAME1_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        locX: -100.0,
        locY: 120.0,
        shotZone: 'Mid-Range',
        shotZoneArea: 'Left Side Center(LC)',
        shotZoneRange: '16-24 ft.',
        shotDistance: 16,
        shotType: ShotType.TWO_POINTER,
        shotResult: ShotResult.MADE,
        actionType: 'Fadeaway Jump Shot',
        period: 3,
        gameClock: '10:02',
        shotValue: 2,
      },
      // 7. Three-pointer right wing — MISSED
      {
        playerId: LEBRON_ID,
        teamId: LAKERS_ID,
        gameId: GAME1_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        locX: 180.0,
        locY: 150.0,
        shotZone: 'Above the Break 3',
        shotZoneArea: 'Right Side Center(RC)',
        shotZoneRange: '24+ ft.',
        shotDistance: 26,
        shotType: ShotType.THREE_POINTER,
        shotResult: ShotResult.MISSED,
        actionType: 'Jump Shot',
        period: 3,
        gameClock: '6:48',
        shotValue: 3,
      },
      // 8. Driving finger roll — MADE
      {
        playerId: LEBRON_ID,
        teamId: LAKERS_ID,
        gameId: GAME1_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        locX: 20.0,
        locY: 25.0,
        shotZone: 'In The Paint (Non-RA)',
        shotZoneArea: 'Center(C)',
        shotZoneRange: 'Less Than 8 ft.',
        shotDistance: 3,
        shotType: ShotType.TWO_POINTER,
        shotResult: ShotResult.MADE,
        actionType: 'Driving Finger Roll Layup',
        period: 3,
        gameClock: '2:05',
        shotValue: 2,
      },
      // 9. Three-pointer above the break — MADE
      {
        playerId: LEBRON_ID,
        teamId: LAKERS_ID,
        gameId: GAME1_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        locX: 50.0,
        locY: 240.0,
        shotZone: 'Above the Break 3',
        shotZoneArea: 'Center(C)',
        shotZoneRange: '24+ ft.',
        shotDistance: 25,
        shotType: ShotType.THREE_POINTER,
        shotResult: ShotResult.MADE,
        actionType: 'Pull-Up Jump Shot',
        period: 4,
        gameClock: '7:33',
        shotValue: 3,
      },
      // 10. Turnaround mid-range — MISSED
      {
        playerId: LEBRON_ID,
        teamId: LAKERS_ID,
        gameId: GAME1_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        locX: -65.0,
        locY: 80.0,
        shotZone: 'Mid-Range',
        shotZoneArea: 'Left Side(L)',
        shotZoneRange: '8-16 ft.',
        shotDistance: 10,
        shotType: ShotType.TWO_POINTER,
        shotResult: ShotResult.MISSED,
        actionType: 'Turnaround Jump Shot',
        period: 4,
        gameClock: '4:18',
        shotValue: 2,
      },
    ],
  })

  // ------------------------------------------------------------------
  // 11. LineupStats (1 Lakers 5-man lineup)
  // ------------------------------------------------------------------
  log('Seeding lineup stats...')

  // Sort player IDs for the lineup key
  const lineupPlayers = [LEBRON_ID, AD_ID, '201566', '1629631', '1630559'].sort()
  const lineupKey = lineupPlayers.join('-')

  await prisma.lineupStats.create({
    data: {
      teamId: LAKERS_ID,
      season: SEASON_ID,
      seasonId: SEASON_ID,
      player1Id: lineupPlayers[0],
      player2Id: lineupPlayers[1],
      player3Id: lineupPlayers[2],
      player4Id: lineupPlayers[3],
      player5Id: lineupPlayers[4],
      lineupKey,
      gamesPlayed: 30,
      totalMinutes: 245.5,
      offRating: 118.2,
      defRating: 108.5,
      netRating: 9.7,
      pace: 99.8,
      points: 480,
      oppPoints: 440,
      fieldGoals: 182,
      fieldGoalAtt: 380,
      fieldGoalPct: 0.479,
      threePointers: 48,
      threePointAtt: 130,
      threePointPct: 0.369,
      freeThrows: 68,
      freeThrowAtt: 88,
      freeThrowPct: 0.773,
      rebounds: 195,
      assists: 110,
      steals: 35,
      blocks: 22,
      turnovers: 52,
      plusMinus: 85.0,
    },
  })

  // ------------------------------------------------------------------
  // 12. Standings (2 teams)
  // ------------------------------------------------------------------
  log('Seeding standings...')

  const standingsDate = new Date('2026-02-21')

  await prisma.standing.createMany({
    data: [
      {
        teamId: LAKERS_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        asOfDate: standingsDate,
        wins: 32,
        losses: 23,
        winPct: 0.582,
        gamesBehind: 4.5,
        streak: 'W2',
        lastTenWins: 6,
        lastTenLosses: 4,
        conferenceRank: 5,
        divisionRank: 2,
        leagueRank: 10,
        playoffSeed: 5,
        homeWins: 19,
        homeLosses: 9,
        awayWins: 13,
        awayLosses: 14,
        confWins: 20,
        confLosses: 14,
        divWins: 6,
        divLosses: 4,
        pointsFor: 114.2,
        pointsAgainst: 110.8,
        pointDiff: 3.4,
      },
      {
        teamId: CELTICS_ID,
        season: SEASON_ID,
        seasonId: SEASON_ID,
        asOfDate: standingsDate,
        wins: 40,
        losses: 16,
        winPct: 0.714,
        gamesBehind: 0.0,
        streak: 'W5',
        lastTenWins: 8,
        lastTenLosses: 2,
        conferenceRank: 1,
        divisionRank: 1,
        leagueRank: 2,
        playoffSeed: 1,
        homeWins: 24,
        homeLosses: 4,
        awayWins: 16,
        awayLosses: 12,
        confWins: 26,
        confLosses: 10,
        divWins: 8,
        divLosses: 2,
        pointsFor: 118.5,
        pointsAgainst: 108.2,
        pointDiff: 10.3,
      },
    ],
  })

  log('Seed complete!')
  log('Summary:')
  log('  - 2 Teams (Lakers, Celtics)')
  log('  - 1 Season (2025-26)')
  log('  - 4 Players (LeBron, AD, Tatum, Brown)')
  log('  - 2 GameBoxScores')
  log('  - 8 PlayerGameLogs')
  log('  - 4 PlayerSeasonStats')
  log('  - 2 TeamSeasonStats')
  log('  - 2 TeamGameEfficiency')
  log('  - 2 TeamEfficiencySnapshot')
  log('  - 10 ShotChart entries')
  log('  - 1 LineupStats')
  log('  - 2 Standings')
}

main()
  .catch((e) => {
    console.error('[seed] Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
