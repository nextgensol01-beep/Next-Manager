import type { ReportStudioConfig, ReportStudioResponse } from "@/lib/report-studio";

type CacheEntry = {
  data: ReportStudioResponse;
  storedAt: number;
};

const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 12;
const responseCache = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<ReportStudioResponse>>();

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)]),
  );
}

function cacheKey(config: ReportStudioConfig) {
  return JSON.stringify(stableValue(config));
}

function pruneCache() {
  if (responseCache.size <= MAX_CACHE_ENTRIES) return;
  const oldest = Array.from(responseCache.entries())
    .sort(([, left], [, right]) => left.storedAt - right.storedAt)
    .slice(0, responseCache.size - MAX_CACHE_ENTRIES);
  oldest.forEach(([key]) => responseCache.delete(key));
}

export function getCachedReportStudio(config: ReportStudioConfig) {
  const key = cacheKey(config);
  const cached = responseCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.storedAt >= CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  return cached.data;
}

export async function fetchReportStudio(config: ReportStudioConfig, options: { refresh?: boolean } = {}) {
  const key = cacheKey(config);
  if (!options.refresh) {
    const cached = getCachedReportStudio(config);
    if (cached) return cached;
  }

  // Reuse the active request even for a refresh. Starting a second identical
  // database report cannot make the result fresher than the one already running.
  const pending = pendingRequests.get(key);
  if (pending) return pending;

  const request = fetch("/api/reports/studio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(config),
  }).then(async (response) => {
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error || "Unable to run report");
    const data = body as ReportStudioResponse;
    responseCache.set(key, { data, storedAt: Date.now() });
    pruneCache();
    return data;
  }).finally(() => {
    pendingRequests.delete(key);
  });

  pendingRequests.set(key, request);
  return request;
}

