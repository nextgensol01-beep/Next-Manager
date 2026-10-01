"use client";
import type { ReactNode } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";
import { useGlassMotion } from "./useGlassMotion";
import { useGlassPointer } from "./useGlassPointer";
import type { GlassIntensity, GlassRadius, GlassVariant } from "./types";

type GlassButtonProps = HTMLMotionProps<"button"> & {
  children: ReactNode;
  variant?: GlassVariant;
  intensity?: GlassIntensity;
  radius?: GlassRadius;
};
export function GlassButton({
  children,
  className,
  disabled,
  type = "button",
  variant = "regular",
  intensity = "medium",
  radius = "pill",
  onPointerEnter,
  onPointerMove,
  onPointerLeave,
  onPointerCancel,
  ...props
}: GlassButtonProps) {
  const pointer = useGlassPointer<HTMLButtonElement>(Boolean(disabled));
  const { reducedMotion, transition } = useGlassMotion();
  return (
    <motion.button
      {...props}
      type={type}
      disabled={disabled}
      onPointerEnter={(event) => {
        pointer.onPointerEnter(event);
        onPointerEnter?.(event);
      }}
      onPointerMove={(event) => {
        pointer.onPointerMove(event);
        onPointerMove?.(event);
      }}
      onPointerLeave={(event) => {
        pointer.onPointerLeave();
        onPointerLeave?.(event);
      }}
      onPointerCancel={(event) => {
        pointer.onPointerCancel();
        onPointerCancel?.(event);
      }}
      whileHover={reducedMotion || disabled ? undefined : { scale: 1.012 }}
      whileTap={reducedMotion || disabled ? undefined : { scale: 0.99 }}
      transition={transition}
      className={cn(
        "glass-surface glass-button",
        `glass-surface--${variant}`,
        `glass-surface--${intensity}`,
        `glass-surface--${radius}`,
        "glass-surface--interactive",
        className,
      )}
    >
      {children}
    </motion.button>
  );
}
