"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetchSingle } from "./api";
import type { ReportContent, ReportMeta } from "@/lib/dashboard-types";

export function useReports() {
  return useQuery({
    queryKey: ["reports"],
    queryFn: () => apiFetchSingle<ReportMeta[]>("/api/reports"),
  });
}

export function useReport(slug: string | undefined) {
  return useQuery({
    queryKey: ["report", slug],
    queryFn: () => apiFetchSingle<ReportContent>(`/api/reports/${slug}`),
    enabled: !!slug,
    placeholderData: (prev) => prev,
  });
}
