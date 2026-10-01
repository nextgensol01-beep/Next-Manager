"use client";

import { useLayoutEffect, useState } from "react";
import type { RefObject } from "react";
import type { GlassEnvironment } from "./types";

function resolveEnvironment(
  element: HTMLElement | null,
  requested: GlassEnvironment,
) {
  if (requested !== "auto") return requested;
  const marked = element?.parentElement?.closest<HTMLElement>(
    "[data-glass-environment]",
  )?.dataset.glassEnvironment;
  if (marked === "light" || marked === "dark" || marked === "media")
    return marked;
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Uses cheap semantic region markers; never samples page pixels or media frames. */
export function useGlassEnvironment(
  ref: RefObject<HTMLElement | null>,
  adaptive: boolean,
  requested: GlassEnvironment = "auto",
) {
  const [environment, setEnvironment] = useState<GlassEnvironment>(
    requested === "auto" ? "light" : requested,
  );
  useLayoutEffect(() => {
    const update = () =>
      setEnvironment(
        requested !== "auto"
          ? requested
          : adaptive
            ? resolveEnvironment(ref.current, requested)
            : "auto",
      );
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    let ancestor = ref.current?.parentElement;
    while (ancestor) {
      observer.observe(ancestor, {
        attributes: true,
        attributeFilter: ["data-glass-environment"],
      });
      ancestor = ancestor.parentElement;
    }
    return () => observer.disconnect();
  }, [adaptive, ref, requested]);
  return environment;
}
