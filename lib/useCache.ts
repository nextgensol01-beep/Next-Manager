"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { cachedFetch, getCached, invalidate } from "./cache";

export { invalidate };

// Overload 1: initialData provided → data is always T (never null)
export function useCache<T>(
  url: string,
  options: { enabled?: boolean; initialData: T }
): { data: T; loading: boolean; error: string | null; refetch: () => void };

// Overload 2: no initialData → data is T | null
export function useCache<T>(
  url: string,
  options?: { enabled?: boolean; initialData?: undefined }
): { data: T | null; loading: boolean; error: string | null; refetch: () => void };

// Implementation
export function useCache<T>(
  url: string,
  { enabled = true, initialData }: { enabled?: boolean; initialData?: T } = {}
): { data: T | null; loading: boolean; error: string | null; refetch: () => void } {
  // Stable ref for initialData — never changes after mount, avoids stale closure issues
  const initRef = useRef<T | null>(initialData !== undefined ? initialData : null);
  const mountedRef  = useRef(true);
  const fetchingRef = useRef(false);
  // Track the url + enabled so the effect re-runs only when these actually change
  const urlRef     = useRef(url);
  const enabledRef = useRef(enabled);
  urlRef.current     = url;
  enabledRef.current = enabled;

  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>(() => {
    if (!enabled) return { data: initRef.current, loading: false, error: null };
    const cached = getCached<T>(url);
    if (cached !== null) return { data: cached, loading: false, error: null };
    return { data: initRef.current, loading: true, error: null };
  });

  // Stable load function — deps are refs so it never changes reference
  const load = useCallback(async (silent = false) => {
    if (!enabledRef.current || fetchingRef.current) return;
    fetchingRef.current = true;

    if (!silent) {
      setState((s) => {
        // Only show spinner if we have no real data yet
        const hasData = s.data !== null && s.data !== (initRef.current as unknown);
        return hasData ? s : { ...s, loading: true };
      });
    }

    try {
      const data = await cachedFetch<T>(urlRef.current);
      if (mountedRef.current) setState({ data, loading: false, error: null });
    } catch (e) {
      if (mountedRef.current)
        setState((s) => ({ ...s, loading: false, error: String(e) }));
    } finally {
      fetchingRef.current = false;
    }
  }, []); // no deps — reads everything via refs

  // Re-run effect only when url or enabled actually changes
  useEffect(() => {
    mountedRef.current = true;
    fetchingRef.current = false;

    const cached = getCached<T>(urlRef.current);
    if (cached !== null) {
      // Only update state if data actually changed to avoid infinite loop
      setState((prev) => {
        if (prev.data === cached && !prev.loading && !prev.error) return prev;
        return { data: cached, loading: false, error: null };
      });
    } else if (enabledRef.current) {
      setState((s) => (s.loading ? s : { ...s, loading: true }));
      load(false);
    }

    return () => { mountedRef.current = false; };
  }, [url, enabled, load]); // stable refs mean load never changes

  const refetch = useCallback(() => {
    invalidate(urlRef.current);
    load(true);
  }, [load]);

  return { ...state, refetch };
}
