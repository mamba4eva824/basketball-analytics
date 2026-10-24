"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { usePlayers } from "@/lib/hooks/usePlayerGamelog";
import { ThemeToggle } from "./ThemeToggle";
import { CURRENT_SEASON, FOCUS_TEAM_ID } from "@/lib/constants";

export function Header() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const { data: searchResults } = usePlayers({ teamId: FOCUS_TEAM_ID, search: searchQuery.length >= 2 ? searchQuery : undefined, pageSize: 8 });

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setShowResults(e.target.value.length >= 2);
  }, []);

  const handlePlayerClick = useCallback((playerId: string) => {
    setShowResults(false);
    setSearchQuery("");
    router.push(`/players/${playerId}`);
  }, [router]);

  return (
    <header className="sticky top-0 z-20 bg-header backdrop-blur-xl border-b border-border-theme transition-colors duration-300">
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3">
        <div className="pl-12 lg:pl-0 min-w-0">
          <h2 className="text-lg font-semibold text-text-primary truncate">Lakers Analytics Dashboard</h2>
          <p className="text-xs text-text-faint truncate">{CURRENT_SEASON} Regular Season</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="flex items-center gap-2 bg-input border border-border-theme rounded-lg px-3 py-2 focus-within:border-lakers-purple/50 transition-colors">
              <svg className="w-4 h-4 text-text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input type="text" placeholder="Search Lakers players..." value={searchQuery} onChange={handleSearch}
                onFocus={() => searchQuery.length >= 2 && setShowResults(true)}
                onBlur={() => setTimeout(() => setShowResults(false), 200)}
                className="bg-transparent text-sm text-text-primary placeholder-text-faint outline-none w-20 sm:w-40 md:w-64" />
            </div>
            {showResults && searchResults?.data && searchResults.data.length > 0 && (
              <div className="absolute top-full right-0 mt-2 w-80 max-h-96 overflow-y-auto glass-card border border-border-strong rounded-xl shadow-2xl">
                <div className="p-2">
                  {searchResults.data.map((player) => (
                    <button key={player.id} onMouseDown={() => handlePlayerClick(player.id)}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-lakers-purple/20 transition-colors text-left">
                      <div className="w-8 h-8 rounded-full bg-lakers-purple/30 flex items-center justify-center text-xs font-bold text-lakers-gold">
                        {player.position || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{player.fullName}</p>
                        <p className="text-xs text-text-muted">{player.team?.abbreviation || "FA"} {player.position ? `| ${player.position}` : ""}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {showResults && searchResults?.data && searchResults.data.length === 0 && searchQuery.length >= 2 && (
              <div className="absolute top-full right-0 mt-2 w-80 glass-card border border-border-strong rounded-xl shadow-2xl p-4 text-center">
                <p className="text-sm text-text-muted">No players found</p>
              </div>
            )}
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
