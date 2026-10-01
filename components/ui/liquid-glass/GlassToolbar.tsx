"use client";

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { GlassSurface } from "./GlassSurface";

export function GlassToolbar({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return <GlassSurface as="section" {...props} interactive className={cn("glass-toolbar", className)} radius="xl">{children}</GlassSurface>;
}
