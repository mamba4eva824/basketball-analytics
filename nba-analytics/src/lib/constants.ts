/**
 * Single source of truth for the focus team and the season (frontend).
 * Must agree with etl/config.py — see .claude/skills/season-rollover.
 */

export const FOCUS_TEAM_ID = "1610612747";
export const FOCUS_TEAM_ABBR = "LAL";

/** Month (1-12) on whose 1st day the new season becomes current. */
const SEASON_ROLLOVER_MONTH = 10;

/** The NBA runs on US Eastern time; etl/config.py uses the same zone (league_today). */
const LEAGUE_TZ = "America/New_York";

/** "2026-27" for any instant from Oct 1 2026 00:00 ET through Sep 30 2027 (ET). */
export function seasonForDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: LEAGUE_TZ, year: "numeric", month: "numeric" }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  return formatSeason(month >= SEASON_ROLLOVER_MONTH ? year : year - 1);
}

export function formatSeason(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function seasonStartYear(season: string): number {
  return Number(season.slice(0, 4));
}

export function previousSeason(season: string): string {
  return formatSeason(seasonStartYear(season) - 1);
}

export const CURRENT_SEASON: string =
  process.env.NEXT_PUBLIC_NBA_SEASON || seasonForDate(new Date());

export const PREVIOUS_SEASON: string = previousSeason(CURRENT_SEASON);
