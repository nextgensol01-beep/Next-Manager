"use client";

import { readJsonResponse } from "@/lib/http-response";

export type ClientDirectoryCacheKey = readonly [url: string, sessionScope: string];

export async function fetchClientDirectoryPage<T>(
  [url]: ClientDirectoryCacheKey
): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const payload = await readJsonResponse(response).catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || `Unable to load clients (HTTP ${response.status}).`);
  }

  return readJsonResponse(response) as Promise<T>;
}
