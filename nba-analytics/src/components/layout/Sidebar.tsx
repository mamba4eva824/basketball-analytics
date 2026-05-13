"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { usePlayers } from "@/lib/hooks/usePlayerGamelog";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { label: "Standings", href: "/standings", icon: "M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" },
  { label: "Roster", href: "/roster", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
  { label: "Games", href: "/games", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const { data: playersData } = usePlayers({ teamId: "1610612747", pageSize: 8 });

  return (
    <>
      <button onClick={() => setIsOpen(!isOpen)} className="fixed top-4 left-4 z-50 lg:hidden p-2 rounded-lg bg-overlay backdrop-blur border border-border-theme" aria-label="Toggle navigation">
        <svg className="w-6 h-6 text-lakers-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {isOpen
            ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />}
        </svg>
      </button>

      {isOpen && <div className="fixed inset-0 bg-overlay z-30 lg:hidden" onClick={() => setIsOpen(false)} />}

      <aside className={`fixed top-0 left-0 z-40 h-full w-64 bg-sidebar backdrop-blur-xl border-r border-border-theme transform transition-all duration-300 lg:translate-x-0 ${isOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="p-6 border-b border-border-theme">
          <Link href="/" className="flex items-center gap-3" onClick={() => setIsOpen(false)}>
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-lakers-purple to-lakers-gold flex items-center justify-center">
              <span className="text-white font-bold text-lg">L</span>
            </div>
            <div>
              <span className="text-lg font-bold text-heading leading-tight">Lakers Analytics</span>
              <p className="text-xs text-text-faint">Dashboard</p>
            </div>
          </Link>
        </div>

        <nav className="p-4 space-y-1">
          <p className="text-xs uppercase tracking-wider text-text-faint mb-3 px-3">Navigation</p>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${isActive ? "bg-lakers-purple/30 text-lakers-gold border border-lakers-purple/40" : "text-text-muted hover:text-text-primary hover:bg-input"}`}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border-theme">
          <p className="text-xs uppercase tracking-wider text-text-faint mb-3 px-3">Lakers Roster</p>
          <div className="space-y-1">
            {playersData?.data.map((player) => {
              const href = `/players/${player.id}`;
              const isActive = pathname.startsWith(href);
              return (
                <Link key={player.id} href={href} onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 ${isActive ? "bg-lakers-purple/30 text-lakers-gold border border-lakers-purple/40" : "text-lakers-gold/80 hover:text-lakers-gold hover:bg-lakers-purple/10"}`}>
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded text-xs font-bold bg-lakers-purple/40 text-lakers-gold">{player.position ?? "—"}</span>
                  <span className="text-sm">{player.fullName}</span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border-theme">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-lakers-purple/10">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-text-muted">2025-26 Season</span>
          </div>
        </div>
      </aside>
    </>
  );
}
