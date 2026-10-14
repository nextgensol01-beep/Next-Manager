"use client";
import { useMemo } from "react";
import { createClientSearchIndex, type ClientSearchSource } from "./client-search";

// Complete, already-loaded collections only. This hook never fetches or delays input.
export function useClientSearch(clients: ClientSearchSource[], query: string) {
  const index = useMemo(() => createClientSearchIndex(clients), [clients]);
  return useMemo(() => index(query), [index, query]);
}
