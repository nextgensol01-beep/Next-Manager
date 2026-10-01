"use client";

import type { HTMLAttributes } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useGlassMotion } from "./useGlassMotion";
import { GlassSurface } from "./GlassSurface";

type GlassPopoverProps = HTMLAttributes<HTMLDivElement> & { open: boolean; layoutId?: string };
export function GlassPopover({ open, layoutId, className, children, ...props }: GlassPopoverProps) {
  const { reducedMotion, softTransition } = useGlassMotion();
  return <AnimatePresence>{open && <motion.div layoutId={layoutId} initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.975, z: -8 }} animate={{ opacity: 1, scale: 1, z: 0 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985, z: -4 }} transition={softTransition} className="glass-popover-wrap"><GlassSurface {...props} className={cn("glass-popover", className)} intensity="strong" radius="lg">{children}</GlassSurface></motion.div>}</AnimatePresence>;
}
