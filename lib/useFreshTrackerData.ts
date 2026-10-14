"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readJsonResponse } from "@/lib/http-response";

/** Keep only this mounted view's data. Every opening/filter/reload reads the server. */
export function useFreshTrackerData<T>(url: string, scope: string, {
  enabled = true, paused = false,
}: { enabled?: boolean; paused?: boolean } = {}) {
  const [state, setState] = useState<{ scope: string; url: string; data: T | null; loading: boolean; settled: boolean; error: string | null }>(
    { scope, url, data: null, loading: enabled, settled: false, error: null },
  );
  const current = useRef({ url, scope, enabled, paused });
  current.current = { url, scope, enabled, paused };
  const generation = useRef(0);
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const cancel = useCallback(() => {
    generation.current += 1;
    active.current?.abort();
    active.current = null;
  }, []);
  const refetch = useCallback(async () => {
    cancel();
    const request = current.current;
    if (!mounted.current || !request.enabled || request.paused) return;
    const version = generation.current;
    const controller = new AbortController();
    active.current = controller;
    setState(previous => ({ scope: request.scope, url: request.url,
      data: previous.scope === request.scope ? previous.data : null, loading: true, settled: false, error: null }));
    const isCurrent = () => mounted.current && generation.current === version
      && current.current.url === request.url && current.current.scope === request.scope
      && !current.current.paused;
    try {
      const response = await fetch(request.url, { cache: "no-store", signal: controller.signal });
      const data = await readJsonResponse<T & { error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "Unable to load tracker. Please try again.");
      if (isCurrent()) setState({ scope: request.scope, url: request.url, data, loading: false, settled: true, error: null });
    } catch (error) {
      if (isCurrent() && !controller.signal.aborted) setState(previous => ({ ...previous, loading: false, settled: true,
        error: error instanceof Error ? error.message : "Unable to load tracker. Please try again." }));
    } finally {
      if (active.current === controller) active.current = null;
    }
  }, [cancel]);
  useEffect(() => {
    mounted.current = true;
    void refetch();
    return () => { mounted.current = false; cancel(); };
  }, [url, scope, enabled, paused, refetch, cancel]);
  const mutate = useCallback((update: T | ((previous: T | null) => T | null)) => {
    if (current.current.scope !== scope || !mounted.current) return;
    // A read started before a write must never replace an acknowledged/optimistic edit.
    cancel();
    const request = current.current;
    setState(previous => ({ scope: request.scope, url: request.url, loading: false, settled: false, error: null,
      data: typeof update === "function"
        ? (update as (previous: T | null) => T | null)(previous.scope === request.scope ? previous.data : null)
        : update }));
  }, [cancel, scope]);
  return {
    data: state.scope === scope ? state.data : null,
    loading: enabled && !paused && (state.scope !== scope || state.url !== url || state.loading || !state.settled),
    error: state.scope === scope && state.url === url ? state.error : null,
    refetch, mutate,
  };
}
