"use client";
import { useThemeColors } from "@/lib/ThemeContext";

/** Half-court SVG frame in stats.nba.com shot coordinates (tenths of feet, basket at 0,0). */
export const COURT_W = 500, COURT_H = 470;
const BX = 250, BY = 52.5;
export function courtX(x: number) { return BX + x / 10 * (COURT_W / 50); }
export function courtY(y: number) { return BY + y / 10 * (COURT_H / 47); }

export function HalfCourtLines() {
  const colors = useThemeColors();
  return (
    <>
      <rect width={COURT_W} height={COURT_H} fill={colors.courtBg} rx="4" />
      <line x1="0" y1="0" x2={COURT_W} y2="0" stroke={colors.courtLineLight} strokeWidth="2" />
      <rect x={COURT_W/2-80} y="0" width="160" height="190" fill="none" stroke={colors.courtLine} strokeWidth="1.5" />
      <circle cx={COURT_W/2} cy="190" r="60" fill="none" stroke={colors.courtLine} strokeWidth="1.5" />
      <path d={`M ${BX-40} 0 A 40 40 0 0 0 ${BX+40} 0`} fill="none" stroke={colors.courtLineMed} strokeWidth="1.5" transform={`translate(0,${BY})`} />
      <circle cx={BX} cy={BY} r="7.5" fill="none" stroke="#FDB927" strokeWidth="2" />
      <line x1={BX-30} y1={BY-7} x2={BX+30} y2={BY-7} stroke={colors.courtLineDetail} strokeWidth="2" />
      <line x1="30" y1="0" x2="30" y2="140" stroke={colors.courtLine} strokeWidth="1.5" />
      <line x1="470" y1="0" x2="470" y2="140" stroke={colors.courtLine} strokeWidth="1.5" />
      <path d="M 30 140 A 238 238 0 0 0 470 140" fill="none" stroke={colors.courtLine} strokeWidth="1.5" />
      <line x1="0" y1={COURT_H} x2={COURT_W} y2={COURT_H} stroke={colors.courtLineLight} strokeWidth="1" />
    </>
  );
}
