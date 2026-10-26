/**
 * Saved game report names (scouting/*.md) — pure, shared by the /api/reports route (which reads
 * the files) and the report panel (which links between them).
 */
import type { ReportKind, ReportMeta } from "@/lib/dashboard-types";

/** e.g. 2026-10-25-LAL-at-UTA or 2026-10-25-LAL-at-UTA-postgame — also the only accepted slugs. */
const SLUG = /^(\d{4}-\d{2}-\d{2})-([A-Z]{2,3})-at-([A-Z]{2,3})(-postgame)?$/;

/** File name (with or without .md) → report metadata; null for anything that isn't a focus-team game report. */
export function parseReportName(name: string, focusAbbr: string): Omit<ReportMeta, "title"> | null {
  const slug = name.replace(/\.md$/, "");
  const m = SLUG.exec(slug);
  if (!m) return null;
  const [, date, away, home, post] = m;
  if (away !== focusAbbr && home !== focusAbbr) return null;
  const kind: ReportKind = post ? "postgame" : "pregame";
  return {
    slug,
    kind,
    date,
    gameKey: `${date}-${away}-at-${home}`,
    opponentAbbr: away === focusAbbr ? home : away,
    homeAway: home === focusAbbr ? "HOME" : "AWAY",
  };
}

/** First `# heading` of the markdown, or null. */
export function reportTitle(markdown: string): string | null {
  const m = /^#\s+(.+)$/m.exec(markdown);
  return m ? m[1].trim() : null;
}
