"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { useLiquidGlassLight } from "@/components/ui/useLiquidGlassLight";

type LiquidGlassLightSurfaceProps = React.HTMLAttributes<HTMLDivElement>;

export default function LiquidGlassLightSurface({
  children,
  className,
  onPointerEnter,
  onPointerLeave,
  onPointerMove,
  ...props
}: LiquidGlassLightSurfaceProps) {
  const light = useLiquidGlassLight<HTMLDivElement>();

  return (
    <div
      {...props}
      className={cn(light.lightClassName, className)}
      onPointerEnter={(event) => {
        light.onPointerEnter(event);
        onPointerEnter?.(event);
      }}
      onPointerLeave={(event) => {
        light.onPointerLeave(event);
        onPointerLeave?.(event);
      }}
      onPointerMove={(event) => {
        light.onPointerMove(event);
        onPointerMove?.(event);
      }}
    >
      {children}
    </div>
  );
}
