"use client";
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, SlidersHorizontal } from "lucide-react";
import {
  GlassButton,
  GlassScrollEdge,
  GlassToolbar,
} from "@/components/ui/liquid-glass";
import { useGlassMotion } from "@/components/ui/liquid-glass/useGlassMotion";

const entries = [
  [
    "01",
    "Colour in motion",
    "Warm tones should remain visible as they cross into the material.",
    "#d85a38",
  ],
  [
    "02",
    "Type, still legible",
    "Watch fine text soften progressively beneath the upper controls.",
    "#817f43",
  ],
  [
    "03",
    "A shallow transition",
    "Diffusion lives at the edge. There is no painted cloud covering the content.",
    "#b89368",
  ],
  [
    "04",
    "The opposite edge",
    "The footer uses the same material with its diffusion direction reversed.",
    "#927894",
  ],
  [
    "05",
    "Real content underneath",
    "These are ordinary selectable DOM elements passing behind backdrop filters.",
    "#599185",
  ],
  [
    "06",
    "A quieter boundary",
    "Look for continuity in the coloured stripe as it passes under the glass.",
    "#d28c39",
  ],
  [
    "07",
    "Last light",
    "The final row can scroll fully into view above the footer.",
    "#ba6458",
  ],
];
export default function ScrollExperiment() {
  const scroller = useRef<HTMLDivElement>(null);
  const [progressive, setProgressive] = useState(true);
  const [dark, setDark] = useState(false);
  const [saved, setSaved] = useState(false);
  const { reducedMotion } = useGlassMotion();
  const move = (direction: number) =>
    scroller.current?.scrollBy({
      top: direction * 185,
      behavior: reducedMotion ? "instant" : "smooth",
    });
  return (
    <div className="lab-scroll-test">
      <div className="lab-scroll-settings">
        <label>
          <input
            type="checkbox"
            checked={progressive}
            onChange={(event) => setProgressive(event.target.checked)}
          />{" "}
          Progressive edge
        </label>
        <label>
          <input
            type="checkbox"
            checked={dark}
            onChange={(event) => setDark(event.target.checked)}
          />{" "}
          Dark content
        </label>
        <span>Scroll inside the frame</span>
      </div>
      <div
        className="lab-scroll-frame"
        data-glass-environment={dark ? "dark" : "light"}
      >
        <div
          className="lab-scroll-content"
          ref={scroller}
          tabIndex={0}
          role="region"
          aria-label="Scrolling content under glass"
        >
          <div className="lab-scroll-intro">
            <span>FIELD NOTES / MATERIAL STUDY</span>
            <h3>
              Let the content
              <br />
              pass through.
            </h3>
            <p>Scroll slowly. Inspect both edges.</p>
          </div>
          {entries.map(([number, title, description, color]) => (
            <article className="lab-scroll-item" key={number}>
              <div className="lab-scroll-swatch" style={{ background: color }}>
                <span>{number}</span>
              </div>
              <div>
                <h4>{title}</h4>
                <p>{description}</p>
                <a href="#lab-controls">Tune this material ↗</a>
              </div>
            </article>
          ))}
        </div>
        <div className="lab-scroll-header">
          <GlassToolbar>
            <SlidersHorizontal size={17} />
            <strong>Reading room</strong>
            <GlassButton aria-label="Scroll up" onClick={() => move(-1)}>
              <ArrowUp size={16} />
            </GlassButton>
            <GlassButton aria-label="Scroll down" onClick={() => move(1)}>
              <ArrowDown size={16} />
            </GlassButton>
          </GlassToolbar>
          {progressive && <GlassScrollEdge edge="top" />}
        </div>
        <div className="lab-scroll-footer">
          {progressive && <GlassScrollEdge edge="bottom" />}
          <GlassToolbar>
            <span aria-live="polite">
              {saved ? "Study marked for review" : "A material, not a veil."}
            </span>
            <GlassButton
              onClick={() => setSaved((value) => !value)}
              aria-pressed={saved}
            >
              <Check size={15} /> {saved ? "Marked" : "Mark study"}
            </GlassButton>
          </GlassToolbar>
        </div>
      </div>
      <p className="lab-caption">
        Unfiltered content → shallow diffusion → transmitting material →
        controls. Toggle the progressive edge to compare.
      </p>
    </div>
  );
}
