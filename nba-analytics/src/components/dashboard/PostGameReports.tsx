"use client";
import Link from "next/link";
import { format } from "date-fns";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useReport, useReports } from "@/lib/hooks/useReports";
import { gameDay } from "@/lib/format";
import { FOCUS_TEAM_ABBR } from "@/lib/constants";
import { parseReportName } from "@/lib/reportNames";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { ErrorDisplay } from "@/components/ui/ErrorDisplay";
import { EmptyState, Section } from "./primitives";
import type { ReportKind, ReportMeta } from "@/lib/dashboard-types";

const reportHref = (slug: string) => `/matchup?view=postgame&report=${slug}`;

/**
 * Saved game reports (scouting/*.md, written by Claude Code's postgame-report and
 * scouting-report skills), rendered in a panel. Post-game first; a game's pre-game report is one
 * click away.
 */
export function PostGameReports({ slug, onSelect }: { slug?: string; onSelect: (slug: string) => void }) {
  const list = useReports();
  const reports = list.data ?? [];
  const postgames = reports.filter((r) => r.kind === "postgame");
  const selected = reports.find((r) => r.slug === slug) ?? postgames[0];
  const report = useReport(selected?.slug);

  if (list.isLoading) return <LoadingSkeleton lines={8} />;
  if (list.error) return <ErrorDisplay title="Reports unavailable" message={list.error.message} onRetry={() => list.refetch()} />;
  if (!postgames.length) {
    return (
      <Section title="Post-game reports">
        <EmptyState>
          No post-game reports yet. After a game, ask Claude Code for a post-game report — it&apos;s saved to
          the scouting folder and shows up here.
        </EmptyState>
      </Section>
    );
  }

  const sibling = (kind: ReportKind) => reports.find((r) => r.gameKey === selected?.gameKey && r.kind === kind);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Game
          <select
            value={selected?.gameKey}
            onChange={(e) => {
              const game = reports.filter((r) => r.gameKey === e.target.value);
              const pick = game.find((r) => r.kind === "postgame") ?? game[0];
              if (pick) onSelect(pick.slug);
            }}
            className="bg-input border border-border-theme rounded-lg px-3 py-2 text-sm text-text-primary min-w-64"
          >
            {uniqueGames(reports).map((g) => (
              <option key={g.gameKey} value={g.gameKey}>{gameLabel(g)}{g.hasPost ? "" : " (pre-game only)"}</option>
            ))}
          </select>
        </label>
        <div role="group" aria-label="Report type" className="inline-flex rounded-lg border border-border-theme p-1 gap-1">
          {(["postgame", "pregame"] as ReportKind[]).map((kind) => {
            const target = sibling(kind);
            return (
              <button
                key={kind}
                disabled={!target}
                aria-pressed={selected?.kind === kind}
                onClick={() => target && onSelect(target.slug)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40 ${selected?.kind === kind ? "bg-lakers-purple text-white" : "text-text-muted hover:text-text-primary"}`}
              >
                {kind === "postgame" ? "Post-game" : "Pre-game scouting"}
              </button>
            );
          })}
        </div>
      </div>

      <article className={`glass-card p-5 md:p-8 min-w-0 transition-opacity ${report.isFetching ? "opacity-60" : ""}`}>
        {report.error ? (
          <EmptyState>{report.error.message}</EmptyState>
        ) : report.data ? (
          <>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN}>{report.data.markdown}</ReactMarkdown>
            <p className="mt-8 pt-3 border-t border-border-theme text-xs text-text-faint">
              Saved report · scouting/{report.data.slug}.md · written by Claude Code
            </p>
          </>
        ) : (
          <LoadingSkeleton lines={10} />
        )}
      </article>
    </div>
  );
}

function uniqueGames(reports: ReportMeta[]) {
  const games = new Map<string, ReportMeta & { hasPost: boolean }>();
  for (const r of reports) {
    const g = games.get(r.gameKey);
    games.set(r.gameKey, { ...(g ?? r), hasPost: (g?.hasPost ?? false) || r.kind === "postgame" });
  }
  return [...games.values()];
}

function gameLabel(r: ReportMeta): string {
  return `${format(gameDay(r.date), "EEE MMM d")} · ${r.homeAway === "HOME" ? "vs" : "@"} ${r.opponentAbbr}`;
}

/** Links between saved game reports (e.g. "2026-10-25-LAL-at-UTA.md") open in this panel; other links open normally. */
function ReportLink({ href, children }: { href?: string; children?: React.ReactNode }) {
  const report = href ? parseReportName(href, FOCUS_TEAM_ABBR) : null;
  if (report) return <Link href={reportHref(report.slug)} scroll={false} className="text-heading underline underline-offset-2">{children}</Link>;
  return <a href={href} target="_blank" rel="noreferrer" className="text-heading underline underline-offset-2">{children}</a>;
}

const MARKDOWN: Components = {
  h1: ({ children }) => <h1 className="text-2xl md:text-3xl font-bold text-heading mb-3">{children}</h1>,
  h2: ({ children }) => <h2 className="text-lg font-semibold text-heading mt-8 mb-3">{children}</h2>,
  h3: ({ children }) => <h3 className="text-base font-semibold text-text-primary mt-5 mb-2">{children}</h3>,
  p: ({ children }) => <p className="text-sm leading-relaxed text-text-secondary my-3">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-5 space-y-1.5 my-3 text-sm text-text-secondary">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1.5 my-3 text-sm text-text-secondary">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
  a: ({ href, children }) => <ReportLink href={href}>{children}</ReportLink>,
  code: ({ children }) => <code className="rounded bg-input px-1 py-0.5 font-mono text-xs">{children}</code>,
  table: ({ children }) => (
    <div className="relative overflow-x-auto my-4">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="text-left py-2 px-2 text-xs uppercase tracking-wider font-medium text-text-muted border-b border-border-theme">{children}</th>,
  td: ({ children }) => <td className="py-2 px-2 align-top text-text-secondary border-b border-border-theme/50">{children}</td>,
  hr: () => <hr className="my-6 border-border-theme" />,
};
