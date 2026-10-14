"use client";
import { useEffect, useState } from "react";

// Use only for text that changes a network query; local filters stay synchronous.
export function useNetworkSearch(value: string, delay = 300) {
  const [applied, setApplied] = useState(value.trim());
  useEffect(() => {
    const timer = setTimeout(() => setApplied(value.trim()), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return applied;
}
