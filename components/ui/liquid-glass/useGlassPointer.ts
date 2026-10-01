"use client";
import { useCallback, useEffect, useRef, type PointerEvent } from "react";
import { useReducedMotion } from "framer-motion";
import { useGlassBehavior } from "./GlassMaterialProvider";

/** Time-based damping; measure on entry, never on animation frames. */
export function useGlassPointer<T extends HTMLElement>(disabled = false) {
  const preference = useReducedMotion();
  const behavior = useGlassBehavior();
  const stopped =
    disabled ||
    preference ||
    behavior.reducedMotion ||
    !behavior.interactive ||
    !behavior.pointerLighting;
  const state = useRef({
    frame: 0,
    time: 0,
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
    element: null as T | null,
    rect: null as DOMRect | null,
  });
  const reset = useCallback(() => {
    const s = state.current;
    cancelAnimationFrame(s.frame);
    s.frame = 0;
    s.x = s.y = s.tx = s.ty = 0;
    s.element?.style.setProperty("--glass-light-x", "38%");
    s.element?.style.setProperty("--glass-light-y", "12%");
    s.element?.style.setProperty("--glass-light-opacity", "0");
    s.element?.style.setProperty("--glass-pointer-x", "0");
    s.element?.style.setProperty("--glass-pointer-y", "0");
  }, []);
  const animate = useCallback(() => {
    const s = state.current;
    if (s.frame) return;
    s.time = performance.now();
    const tick = (now: number) => {
      const damping = 1 - Math.exp(-Math.min(now - s.time, 64) / 125);
      s.time = now;
      s.x += (s.tx - s.x) * damping;
      s.y += (s.ty - s.y) * damping;
      s.element?.style.setProperty("--glass-pointer-x", s.x.toFixed(4));
      s.element?.style.setProperty("--glass-pointer-y", s.y.toFixed(4));
      s.element?.style.setProperty("--glass-light-x", `${38 + s.x * 9}%`);
      s.element?.style.setProperty("--glass-light-y", `${12 + s.y * 4}%`);
      s.frame =
        Math.abs(s.tx - s.x) + Math.abs(s.ty - s.y) > 0.001
          ? requestAnimationFrame(tick)
          : 0;
    };
    s.frame = requestAnimationFrame(tick);
  }, []);
  const onPointerMove = useCallback(
    (event: PointerEvent<T>) => {
      if (stopped || event.pointerType === "touch") return;
      const s = state.current;
      if (
        (event.target as Element).closest(".glass-surface") !==
        event.currentTarget
      )
        return;
      s.element = event.currentTarget;
      s.rect ??= event.currentTarget.getBoundingClientRect();
      s.tx = Math.max(
        -1,
        Math.min(
          1,
          ((event.clientX - s.rect.left) / Math.max(1, s.rect.width)) * 2 - 1,
        ),
      );
      s.ty = Math.max(
        -1,
        Math.min(
          1,
          ((event.clientY - s.rect.top) / Math.max(1, s.rect.height)) * 2 - 1,
        ),
      );
      s.element.style.setProperty("--glass-light-opacity", "1");
      animate();
    },
    [stopped, animate],
  );
  const onPointerEnter = useCallback(
    (event: PointerEvent<T>) => {
      state.current.rect = null;
      onPointerMove(event);
    },
    [onPointerMove],
  );
  const onPointerLeave = useCallback(() => {
    const s = state.current;
    s.tx = s.ty = 0;
    s.rect = null;
    s.element?.style.setProperty("--glass-light-opacity", "0");
    if (!stopped) animate();
  }, [animate, stopped]);
  useEffect(() => {
    if (stopped) reset();
    const settle = () => {
      state.current.rect = null;
      reset();
    };
    window.addEventListener("scroll", settle, { capture: true, passive: true });
    window.addEventListener("resize", settle, { passive: true });
    document.addEventListener("visibilitychange", settle);
    return () => {
      reset();
      window.removeEventListener("scroll", settle, true);
      window.removeEventListener("resize", settle);
      document.removeEventListener("visibilitychange", settle);
    };
  }, [stopped, reset]);
  return {
    onPointerEnter,
    onPointerLeave,
    onPointerMove,
    onPointerCancel: onPointerLeave,
  };
}
