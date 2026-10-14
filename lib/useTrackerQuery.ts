"use client";

import { useCallback, useEffect, useState } from "react";
import { TRACKER_ALL_FILTER } from "@/lib/tracker-filters";

export function useTrackerQuery({ trackerId, search, category, field, value, view, limit = 100 }: {
  trackerId: string;
  search: string;
  category: string;
  field: string;
  value: string;
  view: string;
  limit?: number;
}) {
  const filters = new URLSearchParams();
  if (search.trim()) filters.set("search", search.trim());
  if (category !== TRACKER_ALL_FILTER) filters.set("category", category);
  if (field !== TRACKER_ALL_FILTER && value !== TRACKER_ALL_FILTER && value.trim()) {
    filters.set("field", field);
    filters.set("value", value.trim());
  }
  if (view) filters.set("view", view);
  const filterKey = filters.toString();
  const [appliedFilters, setAppliedFilters] = useState(filterKey);
  useEffect(() => {
    const timer = setTimeout(() => setAppliedFilters(filterKey), 250);
    return () => clearTimeout(timer);
  }, [filterKey]);

  const pageKey = `${trackerId}?${appliedFilters}`;
  const [page, setPage] = useState({ key: pageKey, offset: 0 });
  useEffect(() => {
    setPage(current => current.key === pageKey ? current : { key: pageKey, offset: 0 });
  }, [pageKey]);
  // Reset before constructing the request, so new filters never use an old offset.
  const entryOffset = page.key === pageKey ? page.offset : 0;
  const setEntryOffset = useCallback((next: number | ((current: number) => number)) => {
    setPage(current => ({
      key: pageKey,
      offset: typeof next === "function" ? next(current.key === pageKey ? current.offset : 0) : next,
    }));
  }, [pageKey]);
  const query = new URLSearchParams(appliedFilters);
  query.set("limit", String(limit));
  query.set("offset", String(entryOffset));
  // Whole-tracker summaries load independently; every table request stays paginated.
  query.set("overview", "0");
  return {
    url: `/api/client-trackers/${trackerId}?${query.toString()}`,
    entryOffset,
    setEntryOffset,
    filtersPending: filterKey !== appliedFilters,
  };
}
