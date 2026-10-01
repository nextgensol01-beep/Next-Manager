"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, Circle, RotateCcw } from "lucide-react";
import {
  GlassButton,
  GlassMaterialProvider,
  GlassSurface,
  glassDefaults,
  glassPresets,
  glassVariables,
  type GlassMaterial,
} from "@/components/ui/liquid-glass";
import LegacyExperiments from "./LegacyExperiments";
import LensExperiment from "./LensExperiment";
import ScrollExperiment from "./ScrollExperiment";
import { TuningSliders } from "./TuningSliders";
import "./lab.css";

const backgrounds = [
  ["ember", "Ember / colour"],
  ["neutral", "Neutral / dark"],
  ["light", "White / grey"],
  ["type", "High contrast type"],
  ["spectrum", "Multicolour"],
  ["moving", "Moving colour"],
];
export default function GlassLab() {
  const materialRef = useRef<HTMLDivElement>(null);
  const [material, setMaterial] = useState<GlassMaterial>("regular");
  const [background, setBackground] = useState("ember");
  const [debug, setDebug] = useState("composite");
  const [interactive, setInteractive] = useState(true);
  const [pointerLighting, setPointerLighting] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [refraction, setRefraction] = useState(true);
  const [bounds, setBounds] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [selected, setSelected] = useState(false);
  const [dark, setDark] = useState(false);
  const [themeChosen, setThemeChosen] = useState(false);
  useEffect(() => {
    if (themeChosen) return;
    const update = () =>
      setDark(document.documentElement.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, [themeChosen]);
  useEffect(() => {
    materialRef.current?.dispatchEvent(new Event("glass-tune"));
  }, [material, debug, refraction, bounds, resetKey]);
  const reset = (preset: GlassMaterial) => {
    setMaterial(preset);
    setResetKey((value) => value + 1);
    const variables = glassVariables({
      ...glassDefaults,
      ...glassPresets[preset],
    });
    for (const [name, value] of Object.entries(variables))
      materialRef.current?.style.setProperty(name, String(value));
  };
  const environment = ["light", "type"].includes(background)
    ? "light"
    : "media";
  return (
    <GlassMaterialProvider
      ref={materialRef}
      material={material}
      interactive={interactive}
      pointerLighting={pointerLighting}
      reducedMotion={reducedMotion}
      className="glass-lab"
      data-theme={dark ? "dark" : "light"}
      data-debug={debug}
      data-interactive={interactive ? "on" : "off"}
      data-refraction={refraction ? "on" : "off"}
      data-bounds={bounds ? "on" : "off"}
    >
      <main className="lab-shell">
        <header className="lab-header">
          <a className="lab-wordmark" href="#">
            <Circle size={19} strokeWidth={1.2} /> MATERIAL STUDIES{" "}
            <span>/ 01</span>
          </a>
          <div>
            <span className="lab-dev-badge">DEVELOPMENT LAB</span>
            <button
              type="button"
              onClick={() => {
                setThemeChosen(true);
                setDark((value) => !value);
              }}
              aria-pressed={dark}
            >
              {dark ? "Light" : "Dark"} theme
            </button>
          </div>
        </header>
        <div className="lab-title">
          <div>
            <p className="lab-eyebrow">TRANSMISSION. LIGHT. DEPTH.</p>
            <h1>
              Liquid glass<span>.</span>
            </h1>
          </div>
          <p>
            A material that belongs to its surroundings.
            <br />
            Two rendering paths. One place to tune them.
          </p>
        </div>
        <div className="lab-layout">
          <div className="lab-experiments">
            <section aria-labelledby="surface-title">
              <div className="lab-section-title">
                <h2 id="surface-title">
                  <span>01</span> The material
                </h2>
                <span>ARBITRARY DOM · CSS</span>
              </div>
              <div
                className="lab-hero"
                data-background={background}
                data-glass-environment={environment}
              >
                <div className="lab-hero-scene" aria-hidden="true">
                  <div className="lab-colour-ribbon" />
                  <span>
                    Light
                    <br />
                    in transit.
                  </span>
                </div>
                <div className="lab-hero-meta">
                  <span>OPTICAL STUDY N° 001</span>
                  <span>{material.toUpperCase()} MATERIAL</span>
                </div>
                <GlassSurface interactive radius="xl" className="lab-hero-card">
                  <p className="lab-eyebrow">
                    LESS SURFACE. MORE SURROUNDINGS.
                  </p>
                  <h3>
                    Through,
                    <br />
                    not over.
                  </h3>
                  <p>
                    Colour passes through. Light finds the edge.
                    <br />A second thickness, quietly nested inside.
                  </p>
                  <GlassButton
                    onClick={() => setSelected((value) => !value)}
                    aria-pressed={selected}
                  >
                    {selected ? "Study selected" : "Explore the material"}
                    <ArrowUpRight size={17} />
                  </GlassButton>
                </GlassSurface>
                <span className="lab-hero-caption">
                  Move across the surface. Watch the contour.
                </span>
              </div>
              <div
                className="lab-backgrounds"
                role="group"
                aria-label="Test backgrounds"
              >
                {backgrounds.map(([value, title]) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => setBackground(value)}
                    aria-pressed={background === value}
                  >
                    <i data-swatch={value} />
                    {title}
                  </button>
                ))}
              </div>
            </section>
            <section aria-labelledby="scroll-title">
              <div className="lab-section-title">
                <h2 id="scroll-title">
                  <span>02</span> Under the glass
                </h2>
                <span>SCROLL / HEADER / FOOTER</span>
              </div>
              <ScrollExperiment />
            </section>
            <section aria-labelledby="lens-title">
              <div className="lab-section-title">
                <h2 id="lens-title">
                  <span>03</span> An optical lens
                </h2>
                <span>CONTROLLED SCENE · UV REFRACTION</span>
              </div>
              <LensExperiment materialRef={materialRef} />
            </section>
            <section aria-labelledby="controls-title">
              <div className="lab-section-title">
                <h2 id="controls-title">
                  <span>04</span> A family of surfaces
                </h2>
                <span>SCALE / INTERACTION / MORPH</span>
              </div>
              <LegacyExperiments />
            </section>
            <footer className="lab-footnote">
              <strong>Two paths, deliberately.</strong>
              <p>
                Generic material transmits and filters arbitrary DOM with CSS.
                The optical lens displaces a known texture. Cards and toolbars
                do not run a shader.
              </p>
              <a href="#lab-controls">
                Back to tuning <ArrowUpRight size={13} />
              </a>
            </footer>
          </div>
          <aside
            className="lab-controls"
            id="lab-controls"
            aria-label="Material tuning"
          >
            <div className="lab-controls-heading">
              <div>
                <p className="lab-eyebrow">LIVE PARAMETERS</p>
                <h2>Material desk</h2>
              </div>
              <button
                type="button"
                onClick={() => reset("regular")}
                aria-label="Reset material parameters"
              >
                <RotateCcw size={16} />
              </button>
            </div>
            <div
              className="lab-presets"
              role="group"
              aria-label="Material preset"
            >
              {(["thin", "regular", "thick"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={value === material}
                  onClick={() => reset(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <TuningSliders
              key={resetKey}
              materialRef={materialRef}
              material={material}
            />
            <details open>
              <summary>Behaviour & inspection</summary>
              <div className="lab-toggles">
                {(
                  [
                    ["Interactive", interactive, setInteractive],
                    ["Pointer lighting", pointerLighting, setPointerLighting],
                    ["Reduced motion", reducedMotion, setReducedMotion],
                    ["Lens refraction", refraction, setRefraction],
                    ["Lens bounds", bounds, setBounds],
                  ] as const
                ).map(([label, value, update]) => (
                  <label key={label}>
                    <input
                      type="checkbox"
                      checked={value}
                      onChange={(event) => update(event.target.checked)}
                    />
                    {label}
                  </label>
                ))}
                <label className="lab-layer-select">
                  Layer view
                  <select
                    value={debug}
                    onChange={(event) => setDebug(event.target.value)}
                  >
                    {[
                      "composite",
                      "transmission",
                      "edge",
                      "specular",
                      "depth",
                      "refraction",
                    ].map((value) => (
                      <option key={value} value={value}>
                        {value === "composite" ? "Final composite" : value}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </details>
            <p className="lab-controls-note">
              <ArrowDown size={13} /> Live variables. No React renders while
              dragging material sliders.
            </p>
          </aside>
        </div>
      </main>
    </GlassMaterialProvider>
  );
}
