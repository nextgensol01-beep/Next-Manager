"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { cachedFetch, invalidate } from "@/lib/cache";

type Page<T> = { items: T[]; nextOffset: number | null; hasMore: boolean };

// Bounded server pages for the two formerly capped lists. Existing tables/cards
// load further results as their scroll reaches the end; no new visual controls.
export function usePagedSearch<T>(url: string) {
  const collectionRef = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const paging = useRef({ offset: 0, hasMore: true, loading: false });
  const [state, setState] = useState({ key: url, items: [] as T[], loading: true, error: null as string | null });
  const load = useCallback(async (reset = false) => {
    if (reset) { generation.current++; paging.current = { offset: 0, hasMore: true, loading: false }; }
    if (paging.current.loading || !paging.current.hasMore) return;
    paging.current.loading = true;
    const version = generation.current;
    const offset = paging.current.offset;
    const params = new URLSearchParams(url.split("?")[1] || "");
    params.set("paged", "1"); params.set("offset", String(offset)); params.set("limit", "200");
    const requestUrl = `${url.split("?")[0]}?${params}`;
    if (reset) setState({ key: url, items: [], loading: true, error: null });
    try {
      const page = await cachedFetch<Page<T>>(requestUrl);
      if (version !== generation.current) return;
      paging.current = { offset: page.nextOffset ?? offset, hasMore: page.hasMore, loading: false };
      setState(current => ({ key: url, items: offset === 0 ? page.items : [...current.items, ...page.items], loading: false, error: null }));
    } catch (error) {
      if (version !== generation.current) return;
      paging.current.loading = false;
      setState(current => ({ ...current, loading: false, error: String(error) }));
    }
  }, [url]);
  useEffect(() => {
    const requestGeneration = generation;
    void load(true);
    return () => { requestGeneration.current++; };
  }, [load]);
  useEffect(() => {
    const check = (event?: Event) => {
      if (state.key !== url || state.error || state.loading) return;
      const root = collectionRef.current;
      if (!root) return;
      const target = event?.target;
      const nearEnd = target instanceof HTMLElement && root.contains(target) && target.scrollHeight > target.clientHeight
        ? target.scrollHeight - target.scrollTop - target.clientHeight < 300
        : root.getBoundingClientRect().bottom < window.innerHeight + 300;
      if (nearEnd) void load();
    };
    check();
    document.addEventListener("scroll", check, true);
    window.addEventListener("resize", check);
    return () => { document.removeEventListener("scroll", check, true); window.removeEventListener("resize", check); };
  }, [load, state, url]);
  const refetch = useCallback(() => { invalidate(url.split("?")[0]); void load(true); }, [load, url]);
  return { data: state.key === url ? state.items : [], loading: state.key !== url || state.loading, error: state.error, collectionRef, refetch };
}
