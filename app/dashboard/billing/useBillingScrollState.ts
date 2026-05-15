"use client";

import { useEffect, useRef, useState } from "react";
import { useMotionValue, useMotionValueEvent, useSpring, useTransform } from "framer-motion";
import type { BillingTab } from "./types";

interface UseBillingScrollStateArgs {
  activeTab: BillingTab;
  anyModalOpen: boolean;
}

const HEADER_MERGE_SCROLL = 240;

export function useBillingScrollState({ activeTab, anyModalOpen }: UseBillingScrollStateArgs) {
  const syntheticY = useMotionValue(0);
  const [topControlsHeight, setTopControlsHeight] = useState(100);
  const [headerMerged, setHeaderMerged] = useState(false);
  const [headerDocked, setHeaderDocked] = useState(false);
  const [statsContentHeight, setStatsContentHeight] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  // Ref so the wheel/touch handlers always see the latest value without re-registering.
  const anyModalOpenRef = useRef(anyModalOpen);
  useEffect(() => { anyModalOpenRef.current = anyModalOpen; }, [anyModalOpen]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const el = document.getElementById("dashboard-scroll-area") as HTMLElement | null;
    if (!el) return;

    if (activeTab !== "billing") {
      el.style.overflow = "";
      setHeaderDocked(false);
      return;
    }

    if (isMobile) {
      el.style.overflow = "";
      syntheticY.set(HEADER_MERGE_SCROLL);
      const onWindowScroll = () => {
        const next = window.scrollY > 60;
        setHeaderDocked((current) => (current === next ? current : next));
      };
      window.addEventListener("scroll", onWindowScroll, { passive: true });
      onWindowScroll();
      return () => {
        window.removeEventListener("scroll", onWindowScroll);
        setHeaderDocked(false);
      };
    }

    syntheticY.set(0);
    el.scrollTop = 0;

    let accumulated = 0;

    const unlock = () => {
      accumulated = HEADER_MERGE_SCROLL;
      el.style.overflow = "";
    };

    const relock = () => {
      accumulated = HEADER_MERGE_SCROLL;
      el.style.overflow = "hidden";
    };

    const onWheel = (e: WheelEvent) => {
      // If any modal is open, do not intercept — let the modal scroll.
      if (anyModalOpenRef.current) return;

      const isLocked = el.style.overflow === "hidden";

      if (!isLocked) {
        if (e.deltaY < 0 && el.scrollTop === 0) {
          relock();
          e.preventDefault();
          accumulated = Math.max(0, accumulated + e.deltaY);
          syntheticY.set(accumulated);
        }
        return;
      }

      e.preventDefault();
      accumulated = Math.min(HEADER_MERGE_SCROLL, Math.max(0, accumulated + e.deltaY));
      syntheticY.set(accumulated);

      if (accumulated >= HEADER_MERGE_SCROLL) {
        unlock();
      }
    };

    const onScroll = () => {
      const next = el.scrollTop > 60;
      setHeaderDocked((current) => (current === next ? current : next));
    };

    let touchStartY = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      // If any modal is open, do not intercept — let the modal scroll.
      if (anyModalOpenRef.current) return;

      const isLocked = el.style.overflow === "hidden";
      const delta = touchStartY - e.touches[0].clientY;
      touchStartY = e.touches[0].clientY;

      if (!isLocked) {
        if (delta < 0 && el.scrollTop === 0) {
          relock();
          e.preventDefault();
          accumulated = Math.max(0, accumulated + delta);
          syntheticY.set(accumulated);
        }
        return;
      }

      e.preventDefault();
      accumulated = Math.min(HEADER_MERGE_SCROLL, Math.max(0, accumulated + delta));
      syntheticY.set(accumulated);

      if (accumulated >= HEADER_MERGE_SCROLL) {
        unlock();
      }
    };

    el.style.overflow = "hidden";
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.style.overflow = "";
      setHeaderDocked(false);
    };
  // syntheticY and anyModalOpenRef are stable refs, safe to omit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isMobile]);

  const rawScrollProgress = useTransform(syntheticY, [0, HEADER_MERGE_SCROLL], [0, 1], { clamp: true });
  const scrollProgress = useSpring(rawScrollProgress, {
    stiffness: 300,
    damping: 32,
    mass: 0.5,
    restDelta: 0.001,
  });
  const statsAnimatedHeight = useTransform(
    scrollProgress,
    [0, 1],
    [statsContentHeight + 12, 0],
  );
  const searchBarStickyTop = useTransform(
    statsAnimatedHeight,
    (value) => topControlsHeight + value,
  );

  useMotionValueEvent(syntheticY, "change", (latest) => {
    const next = latest >= HEADER_MERGE_SCROLL;
    setHeaderMerged((current) => (current === next ? current : next));
    if (!next) setHeaderDocked(false);
  });

  return {
    scrollProgress,
    searchBarStickyTop,
    headerMerged,
    headerDocked,
    topControlsHeight,
    setTopControlsHeight,
    statsContentHeight,
    setStatsContentHeight,
    isMobile,
  };
}
