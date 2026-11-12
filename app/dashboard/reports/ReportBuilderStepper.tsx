"use client";

import { Fragment, type PointerEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import ReportStepFluidLayer, { type FluidLayerHandle } from "./ReportStepFluidLayer";

export const REPORT_STEPS = [
  { title: "Dataset selection", description: "Choose the records you want to analyze." },
  { title: "Display structure", description: "Choose what each row represents and how to group the results." },
  { title: "Fields & conditions", description: "Choose columns, calculations and filters." },
  { title: "Preview", description: "Review and customize the actual results." },
  { title: "Save & export", description: "Save this setup for later or download the current results." },
];

const stepEase = [0.22, 1, 0.36, 1] as const;
const layoutSpring = { type: "spring", stiffness: 245, damping: 24, mass: 0.9 } as const;
const materialSpring = { stiffness: 165, damping: 20, mass: 0.9 };
const titleSpring = { stiffness: 175, damping: 21, mass: 0.86 };
const highlightSpring = { stiffness: 125, damping: 19, mass: 1 };

export default function ReportBuilderStepper({ step, reached, reduced, onStep }: { step: number; reached: number; reduced: boolean; onStep: (step: number) => void }) {
  const id = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fluidRef = useRef<FluidLayerHandle>(null);
  const lastPointer = useRef<{ x: number; y: number; at: number } | null>(null);
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const pointerScale = useMotionValue(1);
  const materialX = useSpring(pointerX, materialSpring);
  const materialY = useSpring(pointerY, materialSpring);
  const materialScale = useSpring(pointerScale, materialSpring);
  const titleX = useSpring(useTransform(pointerX, (value) => value * 0.42), titleSpring);
  const titleY = useSpring(useTransform(pointerY, (value) => value * 0.42), titleSpring);
  const highlightX = useSpring(useTransform(pointerX, (value) => value * 2.25), highlightSpring);
  const highlightY = useSpring(useTransform(pointerY, (value) => value * 2.5), highlightSpring);
  const spring = reduced ? { duration: 0.01 } : layoutSpring;
  const textTransition = reduced ? { duration: 0.01 } : { duration: 0.18, ease: stepEase };

  const revealSelected = useCallback(() => {
    const viewport = scrollRef.current;
    const selected = viewport?.querySelector('[aria-current="step"]');
    if (!viewport || !selected || viewport.scrollWidth <= viewport.clientWidth) return;
    const outer = viewport.getBoundingClientRect();
    const pill = selected.getBoundingClientRect();
    if (pill.left < outer.left + 12 || pill.right > outer.right - 12) {
      viewport.scrollTo({ left: viewport.scrollLeft + pill.left - outer.left - (outer.width - pill.width) / 2, behavior: reduced ? "instant" : "smooth" });
    }
  }, [reduced]);

  useEffect(() => {
    const viewport = scrollRef.current;
    const selected = viewport?.querySelector('[aria-current="step"]');
    if (!viewport || !selected) return;
    revealSelected();
    const observer = new ResizeObserver(revealSelected);
    observer.observe(viewport);
    observer.observe(selected);
    return () => observer.disconnect();
  }, [step, revealSelected]);

  const resetPointer = useCallback(() => {
    lastPointer.current = null;
    pointerX.set(0);
    pointerY.set(0);
    pointerScale.set(1);
  }, [pointerX, pointerY, pointerScale]);

  useEffect(() => { resetPointer(); }, [step, reduced, resetPointer]);

  const updatePointer = (event: PointerEvent<HTMLButtonElement>) => {
    if (reduced || event.pointerType === "touch") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    const previous = lastPointer.current;
    const at = event.timeStamp;
    if (previous) {
      const elapsed = Math.max(8, Math.min(48, at - previous.at));
      fluidRef.current?.disturb(x, y, ((x - previous.x) * bounds.width) / elapsed, ((y - previous.y) * bounds.height) / elapsed);
    }
    lastPointer.current = { x, y, at };
    pointerX.set((x * 2 - 1) * 3.6);
    pointerY.set((y * 2 - 1) * 2.5);
    pointerScale.set(1.014);
  };

  return <LayoutGroup id={id}>
    <nav className="fluid-step-navigation" aria-label="Report builder steps">
      <div className="fluid-step-scroll" ref={scrollRef}>
        <div className="fluid-step-track">{REPORT_STEPS.map((entry, index) => {
          const selected = step === index;
          const available = index <= reached;
          const hovered = available && hoveredStep === index;
          const expanded = selected || hovered;
          return <Fragment key={entry.title}>
            {index > 0 && <motion.span layout transition={spring} className={`fluid-step-connector${index <= step ? " is-complete" : ""}`} aria-hidden="true" />}
            <motion.button layout transition={spring} type="button" className={`fluid-step${expanded ? " is-expanded" : ""}${selected ? " is-selected" : ""}${selected && hovered ? " is-hovered" : ""}`}
              aria-current={selected ? "step" : undefined} aria-label={`Step ${index + 1}: ${entry.title}`} disabled={!available}
              onClick={() => {
                setHoveredStep(index);
                if (!selected) resetPointer();
                onStep(index);
              }}
              onMouseEnter={() => {
                setHoveredStep(index);
                if (selected && !reduced) pointerScale.set(1.012);
              }}
              onMouseLeave={() => {
                setHoveredStep(null);
                if (selected) resetPointer();
              }}
              onFocus={() => setHoveredStep(index)}
              onBlur={() => {
                setHoveredStep(null);
                if (selected) resetPointer();
              }}
              onPointerMove={selected ? updatePointer : undefined}
              onLayoutAnimationComplete={selected ? revealSelected : undefined}
              whileTap={reduced ? undefined : { scale: 0.985 }}>
              {selected && <motion.span layoutId="report-step-material" transition={spring} className="fluid-step-material" aria-hidden="true"
                style={reduced ? undefined : { x: materialX, y: materialY, scale: materialScale }}>
                {!reduced && <span key={step} className="fluid-step-liquid" />}
                <ReportStepFluidLayer ref={fluidRef} active={hovered} reduceMotion={reduced} />
                <span className="fluid-step-frost" />
                <motion.span className="fluid-step-pointer-highlight" style={reduced ? undefined : { x: highlightX, y: highlightY }} />
              </motion.span>}
              <motion.span className="fluid-step-content" style={selected && !reduced ? { x: titleX, y: titleY } : undefined}
                animate={hovered && !selected && !reduced ? { scale: [0.975, 1.012, 1], y: [0, -0.5, 0] } : { scale: 1 }}
                transition={selected ? spring : { duration: 0.3, ease: stepEase }}>
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.span key={expanded ? "title" : "number"}
                    className={expanded ? "fluid-step-title" : "fluid-step-number"}
                    initial={reduced ? { opacity: 0 } : { opacity: 0, scale: expanded ? 0.95 : 0.88, filter: "blur(3px)" }}
                    animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.88, filter: "blur(3px)" }}
                    transition={textTransition}>
                    {expanded ? entry.title : index + 1}
                  </motion.span>
                </AnimatePresence>
              </motion.span>
            </motion.button>
          </Fragment>;
        })}</div>
      </div>
    </nav>
  </LayoutGroup>;
}

export function ReportStepDescription({ step, reduced }: { step: number; reduced: boolean }) {
  return <div aria-live="polite">
    <AnimatePresence initial={false} mode="wait">
      <motion.p key={step} className="report-caption"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 7, filter: "blur(3px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: -5, filter: "blur(3px)" }}
        transition={reduced ? { duration: 0.01 } : { duration: 0.24, ease: stepEase }}>
        {REPORT_STEPS[step].description}
      </motion.p>
    </AnimatePresence>
  </div>;
}
