"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useRef, useState, type ReactNode, type RefObject } from "react";

type View = "overview" | "explore";
const ease = [.22, 1, .36, 1] as const;

/** One persistent optical surface: position and press can be interrupted independently. */
export function ScenarioGlassTabs({ value, onChange }: { value: View; onChange: (view: View) => void }) {
  const reduce = useReducedMotion(), [pressed, setPressed] = useState(false);
  return <div className="scenario-view-tabs scenario-glass-tabs" role="tablist" aria-label="Rule test views" data-active={value} data-pressed={pressed || undefined}
    onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerCancel={() => setPressed(false)} onPointerLeave={() => setPressed(false)}
    onKeyUp={() => setPressed(false)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPressed(false); }} onKeyDown={event => {
      if (event.key === " " || event.key === "Enter") setPressed(true);
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); const next = event.key === "Home" ? "overview" : event.key === "End" ? "explore" : value === "overview" ? "explore" : "overview";
      onChange(next); event.currentTarget.querySelector<HTMLButtonElement>("#scenario-tab-" + next)?.focus();
    }}>
    <motion.span aria-hidden="true" className="scenario-glass-pill" initial={false}
      animate={{ x: value === "explore" ? "100%" : "0%", scaleX: reduce ? 1 : pressed ? .985 : 1, scaleY: reduce ? 1 : pressed ? .965 : 1 }}
      transition={{ x: reduce ? { duration: 0 } : { type: "spring", stiffness: 350, damping: 32, mass: .85 }, scaleX: { duration: reduce ? 0 : .1 }, scaleY: { duration: reduce ? 0 : .1 } }} />
    {(["overview", "explore"] as const).map(view => <button type="button" key={view} role="tab" id={"scenario-tab-" + view} aria-controls={"scenario-view-" + view} aria-selected={value === view} tabIndex={value === view ? 0 : -1} onClick={() => onChange(view)}>{view === "overview" ? "Overview" : "Explore clients"}</button>)}
  </div>;
}

/** Keep the existing panel/iframe alive. Only the outgoing surface exits the accessibility tree. */
export function ScenarioView({ active, view, root, children }: { active: boolean; view: View; root: RefObject<HTMLDivElement | null>; children: ReactNode }) {
  const reduce = useReducedMotion(), [concealed, setConcealed] = useState(!active), latestActive = useRef(active);
  latestActive.current = active;
  return <motion.div ref={root} role="tabpanel" id={"scenario-view-" + view} aria-labelledby={"scenario-tab-" + view}
    aria-hidden={!active || undefined} inert={!active || undefined} hidden={concealed && !active} tabIndex={active && view === "overview" ? 0 : undefined}
    className={"scenario-view scenario-" + view + "-view"} initial={false}
    animate={{ opacity: active ? 1 : 0, x: reduce ? 0 : active ? 0 : view === "overview" ? -6 : 6 }}
    transition={{ duration: reduce ? 0 : active ? .22 : .16, ease }}
    style={{ pointerEvents: active ? "auto" : "none", zIndex: active ? 2 : 1 }}
    onAnimationStart={() => { if (latestActive.current) setConcealed(false); }}
    onAnimationComplete={() => { if (!latestActive.current) setConcealed(true); }}>
    {children}
  </motion.div>;
}
