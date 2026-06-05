"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * useStickyCollapse
 *
 * Replaces the old useBillingScrollState hook. Uses IntersectionObserver
 * on a zero-height sentinel element to detect when the stats section
 * has scrolled behind the sticky top controls.
 *
 * WHY THIS CAN'T CAUSE LAYOUT THRASHING:
 * IntersectionObserver fires based on viewport intersection, not scroll
 * position. When the stats section collapses (reducing content height),
 * the sentinel is already above the viewport — the content shift doesn't
 * move it back into view, so no re-trigger occurs.
 */

interface UseStickyCollapseArgs {
  /** Only activate when the billing tab is shown */
  enabled: boolean;
}

export function useStickyCollapse({ enabled }: UseStickyCollapseArgs) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [docked, setDocked] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [topControlsHeight, setTopControlsHeight] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const update = () => setIsMobile(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setCollapsed(false);
      return;
    }

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    let observer: IntersectionObserver | undefined;

    // Wait one frame so topControlsHeight has been measured
    // (ResizeObserver in BillingTopControls runs synchronously on mount)
    const rafId = requestAnimationFrame(() => {
      observer = new IntersectionObserver(
        ([entry]) => {
          // Sentinel is NOT intersecting → it has scrolled behind the sticky
          // header → collapse the stats section.
          setCollapsed(!entry.isIntersecting);
        },
        {
          threshold: 0,
          // Shrink the observer's effective viewport by the sticky header height.
          // This way the sentinel is "out of view" when it goes behind the
          // sticky TopControls, not just above the actual viewport edge.
          rootMargin: `-${topControlsHeight + 8}px 0px 0px 0px`,
        }
      );

      observer.observe(sentinel);
    });

    const scrollEl = isMobile ? window : document.getElementById("dashboard-scroll-area");
    if (!scrollEl) return;

    let scrollRafId = 0;
    const handleScroll = () => {
      cancelAnimationFrame(scrollRafId);
      scrollRafId = requestAnimationFrame(() => {
        setDocked((current) => {
          const sy = isMobile ? window.scrollY : (scrollEl as HTMLElement).scrollTop;
          const openThreshold = isMobile ? 120 : 140;
          const closeThreshold = isMobile ? 100 : 120;
          if (!current && sy > openThreshold) return true;
          if (current && sy < closeThreshold) return false;
          return current;
        });
      });
    };

    scrollEl.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(scrollRafId);
      scrollEl.removeEventListener("scroll", handleScroll);
      if (observer) {
        observer.disconnect();
      }
    };
  }, [enabled, topControlsHeight, isMobile]);

  const handleTopControlsHeight = useCallback((h: number) => {
    setTopControlsHeight(h);
  }, []);

  return {
    sentinelRef,
    collapsed,
    docked,
    isMobile,
    topControlsHeight,
    setTopControlsHeight: handleTopControlsHeight,
  };
}
