"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveStatus } from "@/lib/hooks/useLiveGame";
import { MatchupDashboard } from "./MatchupDashboard";
import { LiveGameView } from "./LiveGameView";
import { PostGameReports } from "./PostGameReports";

type View = "scouting" | "live" | "postgame";

const VIEWS: { id: View; label: string }[] = [
  { id: "scouting", label: "Scouting report" },
  { id: "live", label: "In-game" },
  { id: "postgame", label: "Post-game" },
];

/**
 * /matchup: pre-game scouting report, in-game tracking (?view=live) for today's game, or the
 * saved post-game reports (?view=postgame&report=<slug>). ?view=live&game=<id> replays a past game.
 */
export function MatchupView() {
  const params = useSearchParams();
  const router = useRouter();
  const requested = params.get("view");
  const view: View = requested === "live" || requested === "postgame" ? requested : "scouting";
  const isLive = useLiveStatus().data?.live ?? false;

  const navigate = (v: View, extra: { report?: string; game?: string | null } = {}) => {
    const next = new URLSearchParams(params);
    if (v === "scouting") next.delete("view");
    else next.set("view", v);
    if (extra.report) next.set("report", extra.report);
    else if (v !== "postgame") next.delete("report");
    if (extra.game) next.set("game", extra.game);
    else if (v !== "live" || extra.game === null) next.delete("game");
    const qs = next.toString();
    router.replace(qs ? `/matchup?${qs}` : "/matchup", { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Matchup view" className="inline-flex flex-wrap rounded-lg border border-border-theme p-1 gap-1">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={view === v.id}
            onClick={() => navigate(v.id)}
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${view === v.id ? "bg-lakers-purple text-white" : "text-text-muted hover:text-text-primary"}`}
          >
            {v.label}
            {v.id === "live" && isLive && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/90 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" aria-hidden />
                Live
              </span>
            )}
          </button>
        ))}
      </div>
      {view === "live" && <LiveGameView gameId={params.get("game") ?? undefined} onSelectGame={(game) => navigate("live", { game })} />}
      {view === "postgame" && <PostGameReports slug={params.get("report") ?? undefined} onSelect={(slug) => navigate("postgame", { report: slug })} />}
      {view === "scouting" && <MatchupDashboard />}
    </div>
  );
}
