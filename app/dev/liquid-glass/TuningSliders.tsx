"use client";
import type { RefObject } from "react";
import {
  glassDefaults,
  glassPresets,
  glassUnits,
  type GlassMaterial,
  type GlassParameter,
} from "@/components/ui/liquid-glass/material";

const sections: {
  title: string;
  controls: [GlassParameter, string, number, number, number][];
}[] = [
  {
    title: "Material body",
    controls: [
      ["blur", "Diffusion", 0, 24, 1],
      ["transmission", "Transmission", 0.5, 1, 0.01],
      ["saturation", "Colour bleed", 1, 2, 0.05],
      ["brightness", "Brightness", 0.8, 1.2, 0.01],
      ["tint", "Neutral tint", 0, 0.18, 0.01],
      ["radius", "Corner radius", 8, 48, 1],
    ],
  },
  {
    title: "Surface light",
    controls: [
      ["edge", "Contour", 0, 0.8, 0.01],
      ["highlight", "Specular", 0, 0.4, 0.01],
      ["depth", "Internal depth", 0, 0.35, 0.01],
      ["transition", "Scroll transition", 12, 48, 1],
    ],
  },
  {
    title: "Controlled lens",
    controls: [
      ["refraction", "Refraction", 0, 0.4, 0.01],
      ["edgeRefraction", "Edge refraction", 0, 1, 0.01],
      ["fresnel", "Fresnel", 0, 0.6, 0.01],
      ["aberration", "Aberration", 0, 0.003, 0.0001],
      ["lensRadius", "Lens radius", 60, 145, 1],
    ],
  },
];
export function TuningSliders({
  materialRef,
  material,
}: {
  materialRef: RefObject<HTMLDivElement | null>;
  material: GlassMaterial;
}) {
  const defaults = { ...glassDefaults, ...glassPresets[material] };
  return (
    <>
      {sections.map((section) => (
        <details key={section.title} open>
          <summary>{section.title}</summary>
          <div className="lab-sliders">
            {section.controls.map(([key, title, min, max, step]) => (
              <label key={`${material}-${key}`}>
                <span>
                  {title}
                  <output>
                    {defaults[key]}
                    {glassUnits[key] ?? ""}
                  </output>
                </span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  defaultValue={defaults[key]}
                  aria-label={title}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    materialRef.current?.style.setProperty(
                      `--optical-${key}`,
                      value + (glassUnits[key] ?? ""),
                    );
                    const output =
                      event.currentTarget.parentElement?.querySelector(
                        "output",
                      );
                    if (output) output.value = value + (glassUnits[key] ?? "");
                    materialRef.current?.dispatchEvent(new Event("glass-tune"));
                  }}
                />
              </label>
            ))}
          </div>
        </details>
      ))}
    </>
  );
}
