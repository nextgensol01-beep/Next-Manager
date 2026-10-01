import type { HTMLAttributes, ReactNode } from "react";

export type GlassVariant = "regular" | "clear";
export type GlassIntensity = "subtle" | "medium" | "strong";
export type GlassRadius = "sm" | "md" | "lg" | "xl" | "pill";
export type GlassEnvironment = "auto" | "light" | "dark" | "media";

export type GlassSurfaceProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "span" | "section" | "aside";
  children?: ReactNode;
  variant?: GlassVariant;
  intensity?: GlassIntensity;
  radius?: GlassRadius;
  interactive?: boolean;
  adaptive?: boolean;
  morph?: boolean;
  disabled?: boolean;
  environment?: GlassEnvironment;
};
