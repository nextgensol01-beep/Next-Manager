"use client";
import {
  createContext,
  forwardRef,
  useContext,
  type HTMLAttributes,
} from "react";
import {
  glassDefaults,
  glassPresets,
  glassVariables,
  type GlassMaterial,
  type GlassSettings,
} from "./material";

const GlassBehavior = createContext({
  reducedMotion: false,
  interactive: true,
  pointerLighting: true,
  optical: false,
});
export const useGlassBehavior = () => useContext(GlassBehavior);

/** Opt-in boundary: existing production consumers keep their current material. */
export const GlassMaterialProvider = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & {
    material?: GlassMaterial;
    settings?: Partial<GlassSettings>;
    reducedMotion?: boolean;
    interactive?: boolean;
    pointerLighting?: boolean;
  }
>(function GlassMaterialProvider(
  {
    material = "regular",
    settings,
    reducedMotion = false,
    interactive = true,
    pointerLighting = true,
    children,
    className = "",
    style,
    ...props
  },
  ref,
) {
  return (
    <GlassBehavior.Provider
      value={{ reducedMotion, interactive, pointerLighting, optical: true }}
    >
      <div
        {...props}
        ref={ref}
        className={`glass-material ${className}`}
        data-glass-motion={reducedMotion ? "reduced" : "full"}
        style={{
          ...glassVariables({
            ...glassDefaults,
            ...glassPresets[material],
            ...settings,
          }),
          ...style,
        }}
      >
        {children}
      </div>
    </GlassBehavior.Provider>
  );
});
