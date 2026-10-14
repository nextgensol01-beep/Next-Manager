"use client";
import { useSyncExternalStore } from "react";

const query = "(prefers-reduced-motion: reduce)";
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
const snapshot = () => window.matchMedia(query).matches;
const serverSnapshot = () => true;

// The installed Motion hook snapshots at mount. This local control also follows live OS changes.
export function useAuthorizationReducedMotion() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
