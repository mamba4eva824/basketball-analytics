// ─────────────────────────────────────────────
// API Response Envelope
// ─────────────────────────────────────────────

export interface ApiMeta {
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta: ApiMeta;
}

export interface ApiErrorBody {
  code: string;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ─────────────────────────────────────────────
// Enums (mirrors Prisma)
// ─────────────────────────────────────────────

export type Conference = "East" | "West";
export type Division =
  | "Atlantic"
  | "Central"
  | "Southeast"
  | "Northwest"
  | "Pacific"
  | "Southwest";
export type Position =
  | "G" | "F" | "C" | "GF" | "FG" | "FC" | "CF" | "PG" | "SG" | "SF" | "PF";
export type HomeAway = "HOME" | "AWAY";
export type WinLoss = "W" | "L";
export type ShotZone =
  | "RESTRICTED_AREA" | "IN_THE_PAINT" | "MID_RANGE"
  | "LEFT_CORNER_THREE" | "RIGHT_CORNER_THREE" | "ABOVE_THE_BREAK_THREE" | "BACKCOURT";
export type ShotType =
  | "DUNK" | "LAYUP" | "HOOK_SHOT" | "JUMP_SHOT" | "FLOATING_JUMP_SHOT"
  | "PULLUP_JUMP_SHOT" | "STEP_BACK_JUMP_SHOT" | "TURNAROUND_JUMP_SHOT"
  | "FADEAWAY_JUMP_SHOT" | "DRIVING_LAYUP" | "DRIVING_DUNK"
  | "ALLEY_OOP_DUNK" | "ALLEY_OOP_LAYUP" | "TIP_SHOT" | "CUTTING_LAYUP"
  | "FINGER_ROLL_LAYUP" | "PUTBACK_DUNK" | "PUTBACK_LAYUP"
  | "RUNNING_LAYUP" | "RUNNING_DUNK" | "OTHER";

// ─────────────────────────────────────────────
// Domain Models
// ─────────────────────────────────────────────

export interface Team {
  id: string;
  name: string;
  fullName: string;
  abbreviation: string;
  city: string;
  state?: string | null;
  conference: Conference;
  division: Division;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  arenaName?: string | null;
  _count?: { players: number };
}

export interface TeamRef {
  id: string;
  abbreviation: string;
  fullName: string;
  logoUrl?: string | null;
}

export interface TeamDetail extends Team {
  _count: { players: number };
}

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  position?: Position | null;
  height?: string | null;
  heightInches?: number | null;
  weight?: number | null;
  birthDate?: string | null;
  country?: string | null;
  draftYear?: number | null;
  draftRound?: number | null;
  draftNumber?: number | null;
  fromYear?: number | null;
  toYear?: number | null;
  isActive: boolean;
  jerseyNumber?: string | null;
  teamId?: string | null;
  team?: TeamRef | null;
}

export interface PlayerWithTeamDetail extends Player {
  team: {
    id: string;
    abbreviation: string;
    fullName: string;
    city: string;
    conference: Conference;
    division: Division;
    logoUrl?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
  } | null;
}

export interface RosterPlayer extends Player {
  seasonStats?: {
    gamesPlayed: number;
    gamesStarted: number | null;
    minutesPerGame: number;
    pointsPerGame: number;
    totalRebPerGame: number;
    assistsPerGame: number;
  };
}

export interface GameBoxScore {
  id: string;
  gameId: string;
  teamId: string;
  opponentId: string;
  homeTeamId: string;
  awayTeamId: string;
  gameDate: string;
  season: string;
  seasonType: string;
  homeAway: HomeAway;
  result: WinLoss;
  points: number;
  opponentPoints: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  fieldGoalPct: number;
  threePointersMade: number;
  threePointersAttempted: number;
  threePointPct: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  freeThrowPct: number;
  offRebounds: number;
  defRebounds: number;
  totalRebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  personalFouls: number;
  offensiveRating?: number | null;
  defensiveRating?: number | null;
  netRating?: number | null;
  pace?: number | null;
  effectiveFGPct?: number | null;
  trueShootingPct?: number | null;
  turnoverRate?: number | null;
  offReboundPct?: number | null;
  defReboundPct?: number | null;
  freeThrowRate?: number | null;
  assistPct?: number | null;
  assistToTurnover?: number | null;
  opponent?: TeamRef;
}

export interface PlayerGameLog {
  id: string;
  playerId: string;
  teamId: string;
  gameId: string;
  gameDate: string;
  season: string;
  seasonType: string;
  homeAway: HomeAway;
  result: WinLoss;
  matchup?: string | null;
  minutes: number;
  minutesStr?: string | null;
  points: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  fieldGoalPct?: number | null;
  threePointersMade: number;
  threePointersAttempted: number;
  threePointPct?: number | null;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  freeThrowPct?: number | null;
  offRebounds: number;
  defRebounds: number;
  totalRebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  personalFouls: number;
  plusMinus: number;
  offensiveRating?: number | null;
  defensiveRating?: number | null;
  netRating?: number | null;
  effectiveFGPct?: number | null;
  trueShootingPct?: number | null;
  usageRate?: number | null;
  assistPct?: number | null;
  reboundPct?: number | null;
  turnoverRate?: number | null;
  playerImpactEstimate?: number | null;
  fantasyPoints?: number | null;
  gameScore?: number | null;
  team?: TeamRef;
}

export interface PlayerSeasonStats {
  id: string;
  playerId: string;
  teamId: string;
  season: string;
  seasonType: string;
  gamesPlayed: number;
  gamesStarted?: number | null;
  minutesPerGame: number;
  pointsPerGame: number;
  fieldGoalsMadePerGame: number;
  fieldGoalsAttPerGame: number;
  fieldGoalPct?: number | null;
  threePointMadePerGame: number;
  threePointAttPerGame: number;
  threePointPct?: number | null;
  freeThrowMadePerGame: number;
  freeThrowAttPerGame: number;
  freeThrowPct?: number | null;
  offRebPerGame: number;
  defRebPerGame: number;
  totalRebPerGame: number;
  assistsPerGame: number;
  stealsPerGame: number;
  blocksPerGame: number;
  turnoversPerGame: number;
  foulsPerGame: number;
  plusMinusPerGame?: number | null;
  totalPoints?: number | null;
  totalRebounds?: number | null;
  totalAssists?: number | null;
  totalSteals?: number | null;
  totalBlocks?: number | null;
  totalTurnovers?: number | null;
  totalMinutes?: number | null;
  playerEfficiencyRating?: number | null;
  trueShootingPct?: number | null;
  effectiveFGPct?: number | null;
  usageRate?: number | null;
  offensiveRating?: number | null;
  defensiveRating?: number | null;
  netRating?: number | null;
  assistPct?: number | null;
  reboundPct?: number | null;
  offRebPct?: number | null;
  defRebPct?: number | null;
  turnoverRate?: number | null;
  offensiveWinShares?: number | null;
  defensiveWinShares?: number | null;
  winShares?: number | null;
  boxPlusMinus?: number | null;
  valueOverReplacement?: number | null;
  player?: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    position?: Position | null;
    jerseyNumber?: string | null;
    isActive: boolean;
  };
  team?: TeamRef;
}

export interface TeamSeasonStats {
  id: string;
  teamId: string;
  season: string;
  seasonType: string;
  wins: number;
  losses: number;
  winPct: number;
  pointsPerGame: number;
  opponentPPG: number;
  fieldGoalPct?: number | null;
  threePointPct?: number | null;
  freeThrowPct?: number | null;
  reboundsPerGame?: number | null;
  assistsPerGame?: number | null;
  stealsPerGame?: number | null;
  blocksPerGame?: number | null;
  turnoversPerGame?: number | null;
  offensiveRating?: number | null;
  defensiveRating?: number | null;
  netRating?: number | null;
  pace?: number | null;
  effectiveFGPct?: number | null;
  trueShootingPct?: number | null;
  turnoverRate?: number | null;
  offRebPct?: number | null;
  defRebPct?: number | null;
  freeThrowRate?: number | null;
  opponentEffectiveFGPct?: number | null;
  opponentTurnoverRate?: number | null;
  opponentFreeThrowRate?: number | null;
  last10Wins?: number | null;
  last10Losses?: number | null;
  streakType?: string | null;
  streakCount?: number | null;
  team?: Team;
}

export interface ShotChartEntry {
  id: string;
  playerId: string;
  teamId: string;
  gameId: string;
  gameDate: string;
  season: string;
  seasonType: string;
  locationX: number;
  locationY: number;
  shotZone: ShotZone;
  shotZoneDetail?: string | null;
  shotZoneRange?: string | null;
  shotType: ShotType;
  shotDescription?: string | null;
  shotDistance: number;
  made: boolean;
  period: number;
  minutesRemaining: number;
  secondsRemaining: number;
  actionType?: string | null;
  eventType?: string | null;
}

export interface TrendPoint {
  gameDate: string;
  gameId: string;
  matchup?: string | null;
  value: number | null;
  rollingAvg: number | null;
}

export type TrendMetric =
  | "points" | "assists" | "totalRebounds" | "steals" | "blocks"
  | "turnovers" | "minutes" | "plusMinus" | "fieldGoalPct" | "threePointPct"
  | "freeThrowPct" | "effectiveFGPct" | "trueShootingPct" | "usageRate"
  | "offensiveRating" | "defensiveRating" | "netRating" | "gameScore"
  | "fantasyPoints" | "playerImpactEstimate";

export interface Standing {
  id: string;
  teamId: string;
  season: string;
  seasonType: string;
  conference: Conference;
  division: Division;
  wins: number;
  losses: number;
  winPct: number;
  gamesBehind?: number | null;
  conferenceRank: number;
  divisionRank: number;
  homeWins?: number | null;
  homeLosses?: number | null;
  awayWins?: number | null;
  awayLosses?: number | null;
  last10Wins?: number | null;
  last10Losses?: number | null;
  streakType?: string | null;
  streakCount?: number | null;
  pointsPerGame?: number | null;
  opponentPPG?: number | null;
  pointDiff?: number | null;
  clinchIndicator?: string | null;
  asOfDate?: string | null;
  team: {
    id: string;
    name: string;
    fullName: string;
    abbreviation: string;
    city: string;
    conference: Conference;
    division: Division;
    logoUrl?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
  };
}

export interface LeagueLeader extends PlayerSeasonStats {
  rank: number;
}
