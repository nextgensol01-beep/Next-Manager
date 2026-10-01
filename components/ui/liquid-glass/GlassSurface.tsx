"use client";

import React, { useImperativeHandle, useRef } from "react";
import { cn } from "@/lib/utils";
import { useGlassEnvironment } from "./useGlassEnvironment";
import { useGlassPointer } from "./useGlassPointer";
import type { GlassSurfaceProps } from "./types";

export const GlassSurface = React.forwardRef<HTMLElement, GlassSurfaceProps>(
  function GlassSurface(
    {
      as: Tag = "div",
      variant = "regular",
      intensity = "medium",
      radius = "lg",
      interactive = false,
      adaptive = true,
      morph = false,
      disabled = false,
      environment = "auto",
      className,
      children,
      onPointerEnter,
      onPointerMove,
      onPointerLeave,
      onPointerCancel,
      ...props
    },
    forwardedRef,
  ) {
    const elementRef = useRef<HTMLElement | null>(null);
    const pointer = useGlassPointer<HTMLElement>(disabled || !interactive);
    const resolvedEnvironment = useGlassEnvironment(
      elementRef,
      adaptive,
      environment,
    );
    useImperativeHandle(forwardedRef, () => elementRef.current as HTMLElement);
    return React.createElement(
      Tag,
      {
        ...props,
        ref: elementRef,
        "data-glass-environment": resolvedEnvironment,
        "data-glass-variant": variant,
        className: cn(
          "glass-surface",
          `glass-surface--${variant}`,
          `glass-surface--${intensity}`,
          `glass-surface--${radius}`,
          interactive && "glass-surface--interactive",
          morph && "glass-surface--morph",
          disabled && "glass-surface--disabled",
          className,
        ),
        onPointerEnter: (event: React.PointerEvent<HTMLElement>) => {
          if (interactive) pointer.onPointerEnter(event);
          onPointerEnter?.(event);
        },
        onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
          if (interactive) pointer.onPointerMove(event);
          onPointerMove?.(event);
        },
        onPointerLeave: (event: React.PointerEvent<HTMLElement>) => {
          if (interactive) pointer.onPointerLeave();
          onPointerLeave?.(event);
        },
        onPointerCancel: (event: React.PointerEvent<HTMLElement>) => {
          if (interactive) pointer.onPointerCancel();
          onPointerCancel?.(event);
        },
      },
      children,
    );
  },
);
