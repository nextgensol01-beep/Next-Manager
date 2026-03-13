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

/** Returns cached data if fresh, otherwise fetches, stores and returns. */
export async function cachedFetch<T>(url: string): Promise<T> {
  const hit = store.get(url);
  if (hit && Date.now() - hit.at < STALE_MS) {
    return hit.data as T;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  store.set(url, { data, at: Date.now() });
  return data as T;
}

/** Returns cached data synchronously if fresh, or null if not cached/stale. */
export function getCached<T>(url: string): T | null {
  const hit = store.get(url);
  if (hit && Date.now() - hit.at < STALE_MS) return hit.data as T;
  return null;
}

/**
 * Invalidate all cache entries whose key starts with any of the given prefixes.
 * Does NOT clear the data from memory — just marks it as stale by removing the entry.
 * The next cachedFetch call will re-fetch and re-populate.
 */
export function invalidate(...prefixes: string[]) {
  for (const prefix of prefixes) {
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) store.delete(key);
    }
  }
}

export function clearAll() {
  store.clear();
}
