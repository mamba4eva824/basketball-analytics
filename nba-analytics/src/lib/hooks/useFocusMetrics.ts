"use client";
import { useCallback, useSyncExternalStore } from "react";
import { RANKED_METRICS, type RankedMetric } from "@/lib/analytics/ranks";

/**
 * The viewer's pinned focus metrics, kept in this browser (localStorage; a per-viewer
 * convenience — unreadable storage just means the defaults). Shared by the dashboard scorecard and
 * the Season progress page, and kept in sync across tabs.
 */
const KEY = "lakers.focusMetrics";
const EVENT = "lakers-focus-metrics";

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

function parse(raw: string | null, defaults: RankedMetric[]): RankedMetric[] {
  if (!raw) return defaults;
  try {
    const list = (JSON.parse(raw) as unknown[]).filter((m): m is RankedMetric => RANKED_METRICS.includes(m as RankedMetric));
    return list.length ? list : defaults;
  } catch {
    return defaults;
  }
}

export function useFocusMetrics(defaults: RankedMetric[]) {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const metrics = parse(raw, defaults);
  const save = useCallback((next: RankedMetric[] | null) => {
    try {
      if (next) window.localStorage.setItem(KEY, JSON.stringify(next));
      else window.localStorage.removeItem(KEY);
    } catch {
      /* storage blocked (private window, previews): the defaults stay */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { metrics, isDefault: raw == null, setMetrics: save, reset: () => save(null) };
}
