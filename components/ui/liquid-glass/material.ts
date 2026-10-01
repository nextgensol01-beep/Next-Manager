import type { CSSProperties } from "react";

export type GlassMaterial = "thin" | "regular" | "thick";
export const glassPresets = {
  thin: { blur: 6, transmission: 0.94, saturation: 1.18, depth: 0.08 },
  regular: { blur: 12, transmission: 0.86, saturation: 1.35, depth: 0.14 },
  thick: { blur: 18, transmission: 0.76, saturation: 1.45, depth: 0.22 },
} satisfies Record<GlassMaterial, Record<string, number>>;
export const glassDefaults = {
  ...glassPresets.regular,
  brightness: 1.02,
  tint: 0.04,
  edge: 0.34,
  highlight: 0.16,
  radius: 28,
  refraction: 0.14,
  edgeRefraction: 0.65,
  fresnel: 0.22,
  aberration: 0.0003,
  lensRadius: 108,
  transition: 28,
};
export type GlassSettings = typeof glassDefaults;
export type GlassParameter = keyof GlassSettings;
export const glassUnits: Partial<Record<GlassParameter, string>> = {
  blur: "px",
  radius: "px",
  transition: "px",
};
export function glassVariables(
  settings: Partial<GlassSettings>,
): CSSProperties {
  return Object.fromEntries(
    Object.entries(settings).map(([key, value]) => [
      `--optical-${key}`,
      `${value}${glassUnits[key as GlassParameter] ?? ""}`,
    ]),
  ) as CSSProperties;
}
