import { readJsonResponse } from "@/lib/http-response";
/**
 * Module-level fetch cache.
 * Lives in JS memory — survives tab switches within a session.
 * Cleared only on full hard-reload.
 */

interface Entry {
  data: unknown;
  at: number;
}

export const store = new Map<string, Entry>();
export const STALE_MS = 5 * 60 * 1000; // 5 minutes
const inFlight = new Map<string, { token: object; promise: Promise<unknown> }>();
let accountScope = "";

/** Called by the session provider before descendants read shared cache data. */
export function setCacheScope(scope: string) {
  if (scope === accountScope) return;
  accountScope = scope;
  clearAll();
}

/** Returns cached data if fresh, otherwise fetches, stores and returns. */
export async function cachedFetch<T>(url: string): Promise<T> {
  const hit = store.get(url);
  if (hit && Date.now() - hit.at < STALE_MS) {
    return hit.data as T;
  }
  const pending = inFlight.get(url);
  if (pending) return pending.promise as Promise<T>;
  const token = {};
  const request = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await readJsonResponse(res);
    // Invalidated/optimistically updated keys must not be repopulated by old reads.
    if (inFlight.get(url)?.token === token) store.set(url, { data, at: Date.now() });
    return data as T;
  })();
  inFlight.set(url, { token, promise: request });
  try { return await request; }
  finally { if (inFlight.get(url)?.token === token) inFlight.delete(url); }
}

/** Returns cached data synchronously if fresh, or null if not cached/stale. */
export function getCached<T>(url: string): T | null {
  const hit = store.get(url);
  if (hit && Date.now() - hit.at < STALE_MS) return hit.data as T;
  return null;
}

/** Stores fresh data for a cache key. Useful for optimistic UI updates. */
export function setCached<T>(url: string, data: T) {
  inFlight.delete(url);
  store.set(url, { data, at: Date.now() });
}

/**
 * Invalidate all cache entries whose key starts with any of the given prefixes.
 * Does NOT clear the data from memory — just marks it as stale by removing the entry.
 * The next cachedFetch call will re-fetch and re-populate.
 */
export function invalidate(...prefixes: string[]) {
  const affected = prefixes.includes("/api/clients")
    ? [...prefixes, "/api/annual-return", "/api/invoices", "/api/quotations", "/api/email-log", "/api/reports"]
    : prefixes;
  for (const prefix of affected) {
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) store.delete(key);
    }
    for (const key of inFlight.keys()) if (key.startsWith(prefix)) inFlight.delete(key);
  }
}

export function clearAll() {
  store.clear();
  inFlight.clear();
}
