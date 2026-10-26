"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readJsonResponse } from "@/lib/http-response";
import { getCached, invalidate, setCached } from "@/lib/cache";

/** Openings/navigation read the server. Same-query background reads retain usable data;
 * request generations prevent a pre-mutation response from replacing a local edit. */
export function useFreshTrackerData<T>(url: string, scope: string, {
  enabled = true, paused = false, retainCached = false, revalidateOnResume = true,
}: { enabled?: boolean; paused?: boolean; retainCached?: boolean; revalidateOnResume?: boolean } = {}) {
  const [state, setState] = useState<{ scope: string; url: string; data: T | null; loading: boolean; settled: boolean; error: string | null }>(
    () => ({ scope, url, data: retainCached ? getCached<T>(url) : null, loading: enabled, settled: false, error: null }),
  );
  const current = useRef({ url, scope, enabled, paused, retainCached });
  current.current = { url, scope, enabled, paused, retainCached };
  const generation = useRef(0);
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const settledQuery = useRef<string | null>(null);
  const cancel = useCallback(() => {
    generation.current += 1;
    active.current?.abort();
    active.current = null;
  }, []);
  const refetch = useCallback(async (options?: { url?: string; merge?: (previous: T | null, incoming: T) => T }) => {
    cancel();
    const request = current.current;
    if (!mounted.current || !request.enabled || request.paused) return;
    const version = generation.current;
    const controller = new AbortController();
    active.current = controller;
    setState(previous => ({ scope: request.scope, url: request.url,
      data: previous.scope === request.scope ? previous.data : request.retainCached ? getCached<T>(request.url) : null,
      loading: true, settled: previous.scope === request.scope && previous.url === request.url && previous.settled, error: null }));
    const isCurrent = () => mounted.current && generation.current === version
      && current.current.url === request.url && current.current.scope === request.scope
      && !current.current.paused;
    try {
      const response = await fetch(options?.url || request.url, { cache: "no-store", signal: controller.signal });
      const data = await readJsonResponse<T & { error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "Unable to load tracker. Please try again.");
      if (isCurrent()) {
        settledQuery.current = `${request.scope}:${request.url}`;
        if (request.retainCached && !options?.merge) setCached(request.url, data);
        setState(previous => ({ scope: request.scope, url: request.url,
          data: options?.merge ? options.merge(previous.scope === request.scope ? previous.data : null, data) : data,
          loading: false, settled: true, error: null }));
      }
    } catch (error) {
      if (isCurrent() && !controller.signal.aborted) setState(previous => ({ ...previous, loading: false,
        error: error instanceof Error ? error.message : "Unable to load tracker. Please try again." }));
    } finally {
      if (active.current === controller) active.current = null;
    }
  }, [cancel]);
  useEffect(() => {
    mounted.current = true;
    if (paused) cancel();
    else if (revalidateOnResume || settledQuery.current !== `${scope}:${url}`) void refetch();
    return () => { mounted.current = false; cancel(); };
  }, [url, scope, enabled, paused, revalidateOnResume, refetch, cancel]);
  const mutate = useCallback((update: T | ((previous: T | null) => T | null)) => {
    if (current.current.scope !== scope || !mounted.current) return;
    // A read started before a write must never replace an acknowledged/optimistic edit.
    cancel();
    const request = current.current;
    // Optimistic values are never saved as authoritative reopening data.
    if (request.retainCached) invalidate(`/api/client-trackers/${request.scope}?`);
    setState(previous => ({ scope: request.scope, url: previous.scope === request.scope ? previous.url : request.url, loading: false,
      settled: previous.scope === request.scope && previous.settled, error: previous.error,
      data: typeof update === "function"
        ? (update as (previous: T | null) => T | null)(previous.scope === request.scope ? previous.data : null)
        : update }));
  }, [cancel, scope]);
  return {
    data: state.scope === scope ? state.data : null,
    loading: enabled && (state.scope !== scope || state.url !== url || (!paused && !state.settled && !state.error)),
    refreshing: enabled && !paused && state.scope === scope && state.url === url && state.loading && state.settled,
    error: state.scope === scope && state.url === url ? state.error : null,
    backgroundError: state.scope === scope && state.url === url && settledQuery.current === `${scope}:${url}` ? state.error : null,
    refetch, mutate,
  };
}
