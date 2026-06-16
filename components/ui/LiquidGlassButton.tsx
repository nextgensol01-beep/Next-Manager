"use client";

import * as React from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";
import { useLiquidGlassLight } from "@/components/ui/useLiquidGlassLight";

export type LiquidGlassButtonProps = Omit<HTMLMotionProps<"button">, "children"> & {
  children?: React.ReactNode;
  variant?: "default" | "primary" | "danger";
  size?: "sm" | "md" | "lg";
  shape?: "pill" | "circle";
};

export const LiquidGlassButton = React.forwardRef<HTMLButtonElement, LiquidGlassButtonProps>(
  function LiquidGlassButton(
    {
      children,
      className,
      disabled,
      onPointerEnter,
      onPointerLeave,
      onPointerMove,
      shape = "pill",
      size = "md",
      style,
      type = "button",
      variant = "default",
      ...props
    },
    ref
  ) {
    const reducedMotion = useReducedMotion();
    const surroundingLight = useLiquidGlassLight<HTMLButtonElement>();
    const pointerX = useMotionValue(0);
    const pointerY = useMotionValue(0);
    const shineX = useMotionValue(50);
    const shineY = useMotionValue(50);
    const shineOpacity = useMotionValue(0);

    const smoothX = useSpring(pointerX, { stiffness: 180, damping: 18, mass: 0.35 });
    const smoothY = useSpring(pointerY, { stiffness: 180, damping: 18, mass: 0.35 });
    const glowX = useSpring(shineX, { stiffness: 190, damping: 22, mass: 0.45 });
    const glowY = useSpring(shineY, { stiffness: 190, damping: 22, mass: 0.45 });
    const glowOpacity = useSpring(shineOpacity, { stiffness: 180, damping: 24, mass: 0.5 });

    const rotateX = useTransform(smoothY, [-1, 1], [8, -8]);
    const rotateY = useTransform(smoothX, [-1, 1], [-9, 9]);
    const shineBackground = useMotionTemplate`radial-gradient(circle at ${glowX}% ${glowY}%, rgba(255,255,255,0.88), rgba(255,255,255,0.30) 18%, transparent 48%)`;

    const resetMotion = React.useCallback(() => {
      pointerX.set(0);
      pointerY.set(0);
      shineX.set(50);
      shineY.set(50);
      shineOpacity.set(0);
    }, [pointerX, pointerY, shineOpacity, shineX, shineY]);

    const handlePointerMove = React.useCallback(
      (event: React.PointerEvent<HTMLButtonElement>) => {
        onPointerMove?.(event);
        surroundingLight.onPointerMove(event);
        if (disabled || reducedMotion || event.pointerType === "touch") return;

        const rect = event.currentTarget.getBoundingClientRect();
        const localX = event.clientX - rect.left;
        const localY = event.clientY - rect.top;

        pointerX.set(Math.max(-1, Math.min(1, (localX / rect.width - 0.5) * 2)));
        pointerY.set(Math.max(-1, Math.min(1, (localY / rect.height - 0.5) * 2)));
        shineX.set((localX / rect.width) * 100);
        shineY.set((localY / rect.height) * 100);
        shineOpacity.set(1);
      },
      [
        disabled,
        onPointerMove,
        pointerX,
        pointerY,
        reducedMotion,
        shineOpacity,
        shineX,
        shineY,
        surroundingLight,
      ]
    );

    const handlePointerEnter = React.useCallback(
      (event: React.PointerEvent<HTMLButtonElement>) => {
        onPointerEnter?.(event);
        surroundingLight.onPointerEnter(event);
        if (disabled || reducedMotion || event.pointerType === "touch") return;
        shineOpacity.set(0.9);
      },
      [disabled, onPointerEnter, reducedMotion, shineOpacity, surroundingLight]
    );

    const handlePointerLeave = React.useCallback(
      (event: React.PointerEvent<HTMLButtonElement>) => {
        onPointerLeave?.(event);
        surroundingLight.onPointerLeave(event);
        resetMotion();
      },
      [onPointerLeave, resetMotion, surroundingLight]
    );

    return (
      <motion.button
        ref={ref}
        {...props}
        type={type}
        disabled={disabled}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onPointerMove={handlePointerMove}
        whileHover={disabled || reducedMotion ? undefined : { scale: 1.025, y: -2 }}
        whileTap={disabled || reducedMotion ? undefined : { scale: 0.965, y: 1 }}
        style={{
          ...style,
          rotateX: reducedMotion ? 0 : rotateX,
          rotateY: reducedMotion ? 0 : rotateY,
          transformPerspective: 900,
        }}
        className={cn(
          "liquid-glass-button surrounding-light",
          `liquid-glass-button-${variant}`,
          `liquid-glass-button-${size}`,
          shape === "circle" && "liquid-glass-button-icon",
          className
        )}
      >
        {!reducedMotion && (
          <motion.span
            aria-hidden="true"
            className="liquid-glass-button-shine"
            style={{ background: shineBackground, opacity: glowOpacity }}
          />
        )}
        <span aria-hidden="true" className="liquid-glass-button-edge" />
        <span aria-hidden="true" className="liquid-glass-button-refraction" />
        <span className="liquid-glass-button-content">{children}</span>
      </motion.button>
    );
  }
);

export default React.memo(LiquidGlassButton);
