import type { ApiResponse } from "@/lib/types";

export async function apiFetch<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<{ data: T; meta: { total: number; page: number; pageSize: number } }> {
  const url = new URL(path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body && !body.success ? body.error?.message : `HTTP ${res.status}`;
    throw new Error(message);
  }
  const json: ApiResponse<T> = await res.json();
  if (!json.success) {
    throw new Error(json.error.message);
  }
  return { data: json.data, meta: json.meta };
}

export async function apiFetchSingle<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  const { data } = await apiFetch<T>(path, params);
  return data;
}
