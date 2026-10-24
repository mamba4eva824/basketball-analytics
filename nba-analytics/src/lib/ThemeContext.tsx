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
      grid: "rgba(255,255,255,0.06)",
      axis: "rgba(255,255,255,0.1)",
      tick: "#9CA3AF",
      tooltipBg: "rgba(0,0,0,0.9)",
      tooltipBorder: "rgba(85,37,131,0.4)",
      tooltipLabel: "#FDB927",
      labelText: "#E5E7EB",
      polarGrid: "rgba(255,255,255,0.1)",
      refLine: "rgba(255,255,255,0.2)",
      courtBg: "#1a1a1a",
      courtLine: "#444",
      courtLineLight: "#333",
      courtLineMed: "#555",
      courtLineDetail: "#777",
      // Validated with the dataviz palette checker against #0A0A0A (us/them, +/− net)
      us: "#9b72d0",
      them: "#d95926",
      heat: "155, 114, 208",
    };
  }
  return {
    grid: "rgba(0,0,0,0.08)",
    axis: "rgba(0,0,0,0.15)",
    tick: "#6B7280",
    tooltipBg: "rgba(255,255,255,0.95)",
    tooltipBorder: "rgba(85,37,131,0.3)",
    tooltipLabel: "#552583",
    labelText: "#374151",
    polarGrid: "rgba(0,0,0,0.1)",
    refLine: "rgba(0,0,0,0.15)",
    courtBg: "#E8E0D4",
    courtLine: "#C4B8A8",
    courtLineLight: "#D4C8B8",
    courtLineMed: "#B8A898",
    courtLineDetail: "#A89888",
    // Validated with the dataviz palette checker against #F5F0E8 (us/them, +/− net)
    us: "#7A4BAA",
    them: "#d4561f",
    heat: "85, 37, 131",
  };
}
