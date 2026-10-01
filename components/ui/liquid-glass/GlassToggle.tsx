"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  motion,
  useAnimationControls,
  type HTMLMotionProps,
} from "framer-motion";
import { cn } from "@/lib/utils";
import { useGlassMotion } from "./useGlassMotion";
import { useGlassPointer } from "./useGlassPointer";
import { useGlassBehavior } from "./GlassMaterialProvider";

type GlassToggleProps = Omit<
  HTMLMotionProps<"button">,
  "onChange" | "onClick"
> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  thumbClassName?: string;
};

export function GlassToggle({
  checked,
  onCheckedChange,
  className,
  thumbClassName,
  disabled,
  ...props
}: GlassToggleProps) {
  const controls = useAnimationControls();
  const { reducedMotion } = useGlassMotion();
  const { optical } = useGlassBehavior();
  const pointer = useGlassPointer<HTMLButtonElement>(Boolean(disabled));
  const initialized = useRef(false);
  const pendingTarget = useRef<boolean | null>(null);
  const pressed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [phase, setPhase] = useState<"rest" | "pressed" | "travel">("rest");
  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useLayoutEffect(() => {
    if (!initialized.current) {
      controls.set({ x: checked ? 24 : 0, scale: 1, scaleX: 1, scaleY: 1 });
      initialized.current = true;
      return;
    }
    if (pendingTarget.current === checked) {
      pendingTarget.current = null;
      return;
    }
    controls.set({ x: checked ? 24 : 0, scale: 1, scaleX: 1, scaleY: 1 });
  }, [checked, controls]);
  useEffect(() => () => clearTimer(), []);
  const press = () => {
    if (reducedMotion || disabled || optical) return;
    clearTimer();
    pressed.current = true;
    setPhase("pressed");
    void controls.start({
      scale: 0.98,
      scaleX: 1.055,
      scaleY: 0.955,
      transition: { duration: 0.075, ease: [0.2, 0.8, 0.2, 1] },
    });
  };
  const release = () => {
    if (!pressed.current) return;
    pressed.current = false;
    setPhase("rest");
    void controls.start({
      scale: 1,
      scaleX: 1,
      scaleY: 1,
      transition: { duration: 0.14, ease: [0.22, 1, 0.36, 1] },
    });
  };
  const toggle = () => {
    const next = !checked;
    const target = next ? 24 : 0;
    clearTimer();
    pressed.current = false;
    pendingTarget.current = next;
    if (reducedMotion || optical) {
      setPhase("rest");
      void controls.start({
        x: target,
        scale: 1,
        scaleX: 1,
        scaleY: 1,
        transition: {
          duration: reducedMotion ? 0 : 0.18,
          ease: [0.22, 1, 0.36, 1],
        },
      });
    } else {
      setPhase("travel");
      void controls.start({
        x: target,
        scale: [0.98, 1.16, 1.15, 1.105, 1.02, 1],
        scaleX: [1.055, 0.996, 1.105, 1.07, 1.03, 1],
        scaleY: [0.955, 0.997, 0.975, 0.985, 0.97, 1],
        transition: {
          x: { type: "spring", stiffness: 405, damping: 30, mass: 0.78 },
          scale: {
            duration: 0.4,
            times: [0, 0.18, 0.58, 0.72, 0.86, 1],
            ease: [0.22, 1, 0.36, 1],
          },
          scaleX: {
            duration: 0.4,
            times: [0, 0.18, 0.58, 0.72, 0.86, 1],
            ease: [0.22, 1, 0.36, 1],
          },
          scaleY: {
            duration: 0.4,
            times: [0, 0.18, 0.58, 0.72, 0.86, 1],
            ease: [0.22, 1, 0.36, 1],
          },
        },
      });
      timer.current = setTimeout(() => setPhase("rest"), 420);
    }
    onCheckedChange(next);
  };
  return (
    <motion.button
      {...props}
      {...pointer}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onPointerDown={press}
      onPointerCancel={release}
      onBlur={release}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") press();
      }}
      onClick={toggle}
      className={cn(
        "glass-surface glass-toggle glass-surface--interactive glass-surface--pill",
        checked && "is-on",
        className,
      )}
    >
      <motion.span
        className={cn("glass-toggle-thumb", thumbClassName)}
        data-phase={phase}
        initial={{ x: checked ? 24 : 0, scale: 1, scaleX: 1, scaleY: 1 }}
        animate={controls}
      />
    </motion.button>
  );
}
