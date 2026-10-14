"use client";

import { readJsonResponse } from "@/lib/http-response";

import { preload } from "swr";

export type ClientWorkspaceCacheKey = readonly [url: string, sessionScope: string];

export const clientWorkspaceKey = (clientId: string, sessionScope: string) =>
  clientId && sessionScope
    ? [`/api/clients/${encodeURIComponent(clientId)}/workspace`, sessionScope] as const
    : null;

export async function fetchClientWorkspace<T>(
  [url]: ClientWorkspaceCacheKey
): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const payload = await readJsonResponse(response).catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || `Unable to load client workspace (HTTP ${response.status}).`);
  }

  return readJsonResponse(response) as Promise<T>;
}

export function prefetchClientWorkspace(clientId: string, sessionScope: string) {
  const key = clientWorkspaceKey(clientId, sessionScope);
  if (!key) return;
  void preload(key, fetchClientWorkspace);
}
