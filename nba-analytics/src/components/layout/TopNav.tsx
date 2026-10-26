"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

type NavItem = { label: string; title?: string; href: string; icon: string };

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { label: "Matchup", href: "/matchup", icon: "M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" },
  { label: "Advanced", title: "Advanced Team Analytics", href: "/advanced", icon: "M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" },
  { label: "Schedule", href: "/schedule", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { label: "Standings", href: "/standings", icon: "M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" },
  { label: "Roster", href: "/roster", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
  { label: "Games", href: "/games", icon: "M4 6h16M4 10h16M4 14h16M4 18h16" },
];

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

/**
 * Horizontal navigation in the style of an Apple segmented control: a frosted track with the
 * current page as a filled pill. Centred on wide screens; scrolls sideways on phones.
 */
export function TopNav() {
  const pathname = usePathname();
  const trackRef = useRef<HTMLUListElement>(null);

  // On a phone the track scrolls; keep the active pill in view (without scrolling the page)
  useEffect(() => {
    const track = trackRef.current;
    const active = track?.querySelector<HTMLElement>("[aria-current=page]");
    if (!track || !active) return;
    const left = active.offsetLeft - track.offsetLeft;
    if (left < track.scrollLeft || left + active.offsetWidth > track.scrollLeft + track.clientWidth) {
      track.scrollTo({ left: left - 16, behavior: "smooth" });
    }
  }, [pathname]);

  return (
    <nav aria-label="Main" className="px-4 md:px-6 pb-3">
      <ul
        ref={trackRef}
        className="[scrollbar-width:none] [&::-webkit-scrollbar]:hidden flex gap-1 w-fit max-w-full mx-auto overflow-x-auto rounded-full p-1 bg-input border border-border-theme shadow-inner"
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                title={item.title ?? item.label}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors duration-200
                  ${active ? "bg-lakers-purple text-white shadow-sm" : "text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/10"}`}
              >
                <svg className={`w-4 h-4 shrink-0 ${active ? "text-white" : "text-lakers-purple dark:text-lakers-gold"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
