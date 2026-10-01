"use client";

import { useReducedMotion } from "framer-motion";
import { useGlassBehavior } from "./GlassMaterialProvider";

export const glassSpring = {
  type: "spring" as const,
  stiffness: 310,
  damping: 28,
  mass: 0.82,
};
export const glassSoftSpring = {
  type: "spring" as const,
  stiffness: 250,
  damping: 30,
  mass: 0.9,
};

export function useGlassMotion() {
  const preference = useReducedMotion();
  const behavior = useGlassBehavior();
  const reducedMotion =
    preference || behavior.reducedMotion || !behavior.interactive;
  return {
    reducedMotion,
    transition: reducedMotion ? { duration: 0.01 } : glassSpring,
    softTransition: reducedMotion ? { duration: 0.01 } : glassSoftSpring,
  };
}
