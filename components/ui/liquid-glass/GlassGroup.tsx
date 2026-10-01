"use client";

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { GlassSurface } from "./GlassSurface";

export function GlassGroup({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <GlassSurface {...props} interactive className={cn("glass-group", className)} radius="pill" intensity="subtle">{children}</GlassSurface>;
}
