"use client";
import { useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { ChevronDown, Search, Settings, X } from "lucide-react";
import {
  GlassButton,
  GlassGroup,
  GlassPopover,
  GlassToggle,
  GlassToolbar,
  useGlassMotion,
} from "@/components/ui/liquid-glass";

export default function LegacyExperiments() {
  const [enabled, setEnabled] = useState(true);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [period, setPeriod] = useState("Day");
  const { reducedMotion, softTransition } = useGlassMotion();
  return (
    <div className="lab-components" data-glass-environment="light">
      <GlassToolbar aria-label="Component examples">
        <GlassButton
          aria-label="Search example"
          onClick={() => setOpen(true)}
          radius="pill"
          className="lab-icon"
        >
          <Search size={17} />
        </GlassButton>
        <GlassGroup>
          {["Day", "Week"].map((value) => (
            <GlassButton
              key={value}
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
            >
              {value}
            </GlassButton>
          ))}
        </GlassGroup>
        <label className="lab-toggle-label">
          Enabled{" "}
          <GlassToggle
            checked={enabled}
            onCheckedChange={setEnabled}
            aria-label="Enable preview"
          />
        </label>
      </GlassToolbar>
      <div className="lab-component-row">
        <GlassButton
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="glass-options"
        >
          <Settings size={15} /> Options <ChevronDown size={14} />
        </GlassButton>
        <GlassButton className="lab-chip" disabled={!enabled}>
          Small chip
        </GlassButton>
        <span className="lab-caption">36 px · pill · toolbar · toggle</span>
      </div>
      <GlassPopover open={open} id="glass-options">
        <p>Material options</p>
        <GlassButton onClick={() => setOpen(false)}>Close options</GlassButton>
      </GlassPopover>
      <div className="lab-morph" aria-label="Shared layout morph demonstration">
        <LayoutGroup id="liquid-glass-demo-morph">
          <AnimatePresence initial={false} mode="popLayout">
            {!expanded ? (
              <motion.button
                key="trigger"
                type="button"
                layoutId="liquid-glass-demo-surface"
                onClick={() => setExpanded(true)}
                className="glass-surface glass-button glass-surface--pill"
                transition={softTransition}
              >
                Morph surface <span aria-hidden="true">↗</span>
              </motion.button>
            ) : (
              <motion.div
                key="panel"
                layoutId="liquid-glass-demo-surface"
                className="glass-surface lab-morph-panel"
                transition={softTransition}
              >
                <motion.div
                  initial={reducedMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <button
                    type="button"
                    onClick={() => setExpanded(false)}
                    aria-label="Collapse morph demo"
                  >
                    <X size={16} />
                  </button>
                  <strong>One continuous surface</strong>
                  <p>The existing shared-layout experiment, preserved.</p>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </LayoutGroup>
      </div>
    </div>
  );
}
