"use client";

import { useCallback, useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

export function useLiquidGlassLight<T extends HTMLElement>() {
  const frameRef = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();

  const updateLight = useCallback((element: T, clientX: number, clientY: number, source: EventTarget | null) => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);

    frameRef.current = requestAnimationFrame(() => {
      const rect = element.getBoundingClientRect();
      const sourceElement = source instanceof Element ? source : element;
      element.style.setProperty("--mouse-x", `${clientX - rect.left}px`);
      element.style.setProperty("--mouse-y", `${clientY - rect.top}px`);
      element.style.setProperty("--reflection-color", getComputedStyle(sourceElement).color);
      element.style.setProperty("--glow-opacity", "1");
      frameRef.current = null;
    });
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<T>) => {
    if (reducedMotion || event.pointerType === "touch") return;
    updateLight(event.currentTarget, event.clientX, event.clientY, event.target);
  }, [reducedMotion, updateLight]);

  const onPointerEnter = useCallback((event: React.PointerEvent<T>) => {
    if (reducedMotion || event.pointerType === "touch") return;
    updateLight(event.currentTarget, event.clientX, event.clientY, event.target);
  }, [reducedMotion, updateLight]);

  const onPointerLeave = useCallback((event: React.PointerEvent<T>) => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    event.currentTarget.style.setProperty("--glow-opacity", "0");
  }, []);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  return {
    lightClassName: "surrounding-light",
    onPointerEnter,
    onPointerLeave,
    onPointerMove,
  };
}
