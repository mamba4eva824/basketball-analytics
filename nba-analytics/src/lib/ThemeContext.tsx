"use client";
import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from "react";
import { DARK_QUERY, STORAGE_KEY } from "./themeScript";

type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";

interface ThemeContextValue {
  /** what is actually rendered */
  theme: Theme;
  /** what the user chose; "system" follows the OS setting */
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  preference: "system",
  setPreference: () => {},
});

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

// One external store covers both inputs: the saved preference and the OS colour scheme.
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", cb);
  window.addEventListener("storage", cb); // other tabs
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", cb);
    window.removeEventListener("storage", cb);
  };
}

const systemPrefersDark = () => window.matchMedia(DARK_QUERY).matches;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Server snapshots match the pre-paint default (system → dark) to avoid hydration drift.
  const preference = useSyncExternalStore(subscribe, readPreference, () => "system" as const);
  const osDark = useSyncExternalStore(subscribe, systemPrefersDark, () => true);
  const theme: Theme = preference === "system" ? (osDark ? "dark" : "light") : preference;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const setPreference = useCallback((pref: ThemePreference) => {
    try {
      if (pref === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, pref);
    } catch {}
    notify();
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, preference, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function useThemeColors() {
  const { theme } = useTheme();
  if (theme === "dark") {
    return {
      grid: "rgba(255,255,255,0.07)",
      axis: "rgba(255,255,255,0.12)",
      tick: "#98989D",
      tooltipBg: "rgba(44,44,46,0.96)",
      tooltipBorder: "rgba(255,255,255,0.1)",
      tooltipLabel: "#FDB927",
      labelText: "#F5F5F7",
      polarGrid: "rgba(255,255,255,0.1)",
      refLine: "rgba(255,255,255,0.2)",
      courtBg: "#1C1C1E",
      courtLine: "#48484A",
      courtLineLight: "#3A3A3C",
      courtLineMed: "#545456",
      courtLineDetail: "#7C7C80",
      // Validated with the dataviz palette checker against #0A0A0A (cards are now #1C1C1E) (us/them, +/− net)
      us: "#9b72d0",
      them: "#d95926",
      /** trend / rolling-average lines (Lakers gold) */
      trend: "#FDB927",
      heat: "155, 114, 208",
    };
  }
  return {
    grid: "rgba(0,0,0,0.06)",
    axis: "rgba(0,0,0,0.12)",
    tick: "#6E6E73",
    tooltipBg: "rgba(255,255,255,0.97)",
    tooltipBorder: "rgba(0,0,0,0.08)",
    tooltipLabel: "#552583",
    labelText: "#1D1D1F",
    polarGrid: "rgba(0,0,0,0.1)",
    refLine: "rgba(0,0,0,0.15)",
    courtBg: "#F2F2F4",
    courtLine: "#C7C7CC",
    courtLineLight: "#D8D8DC",
    courtLineMed: "#AEAEB2",
    courtLineDetail: "#8E8E93",
    // Validated with the dataviz palette checker against #F5F0E8 (us/them, +/− net); cards are now #FFFFFF
    us: "#7A4BAA",
    them: "#d4561f",
    /** trend / rolling-average lines (dark Lakers gold, ~3.5:1 against #F5F0E8) */
    trend: "#A87508",
    heat: "85, 37, 131",
  };
}
