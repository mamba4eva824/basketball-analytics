"use client";
import { useState } from "react";
import { AdvancedTeamAnalytics } from "./AdvancedTeamAnalytics";
import { AdvancedPlayerAnalytics } from "./AdvancedPlayerAnalytics";

const VIEWS = [
  { key: "team", label: "Team" },
  { key: "players", label: "Players" },
] as const;

/** /advanced: team metrics or player metrics, game by game. */
export function AdvancedAnalytics() {
  const [view, setView] = useState<(typeof VIEWS)[number]["key"]>("team");
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Advanced analytics view" className="segmented">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            role="tab"
            aria-selected={view === v.key}
            onClick={() => setView(v.key)}
            className="segment px-3 py-1.5 text-sm"
          >
            {v.label}
          </button>
        ))}
      </div>
      {view === "team" ? <AdvancedTeamAnalytics /> : <AdvancedPlayerAnalytics />}
    </div>
  );
}
