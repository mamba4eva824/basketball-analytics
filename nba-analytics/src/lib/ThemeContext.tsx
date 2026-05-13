"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      localStorage.setItem("theme", next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
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
  };
}
