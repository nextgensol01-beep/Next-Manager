"use client";

import { useId, useRef } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { ArrowDown, Check } from "lucide-react";
import { GlassSurface } from "@/components/ui/liquid-glass";
import type { TrackerEmailWorkflow, TrackerField } from "@/lib/clientTrackers";
import { emailStyleSamples, type EmailStyleSample } from "@/lib/workflow-email-style";

type EmailStyle = NonNullable<TrackerEmailWorkflow["contentMode"]>;
const choices: { mode: EmailStyle; title: string; explanation: string }[] = [
  { mode: "points", title: "Points", explanation: "Each matching condition adds a short bullet to the email." },
  { mode: "statements", title: "Statements", explanation: "Each match adds a complete sentence to the email." },
  { mode: "combinations", title: "Combinations", explanation: "Matching values are considered together to choose the appropriate message." },
];
const ease = [0.22, 1, 0.36, 1] as const;

function FormatPreview({ mode, samples }: { mode: EmailStyle; samples: EmailStyleSample[] }) {
  return <div className={`workflow-style-preview is-${mode}`} aria-hidden="true">
    <div className="workflow-style-samples">
      {samples.map(sample => <div className="workflow-style-sample" key={sample.key} title={`${sample.label}${mode === "statements" ? " is " : ": "}${sample.value}${mode === "statements" ? "." : ""}`}>
        {mode === "points" && <span className="workflow-style-bullet">•</span>}
        <span className="workflow-style-field">{sample.label}</span>
        <span className="workflow-style-value">{mode === "statements" ? " is " : ": "}{sample.value}{mode === "statements" ? "." : ""}</span>
      </div>)}
    </div>
    {mode === "combinations" && <div className="workflow-style-result"><ArrowDown size={12} /><span>Matching message</span></div>}
  </div>;
}

export default function WorkflowEmailStyleChooser({ workflow, fields, value, onChange, reduced }: {
  workflow: TrackerEmailWorkflow; fields: TrackerField[]; value: EmailStyle;
  onChange: (mode: EmailStyle) => void; reduced: boolean;
}) {
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const samples = emailStyleSamples(fields, workflow);
  const explanation = choices.find(choice => choice.mode === value)!.explanation;
  return <section className="workflow-email-style-chooser">
    <motion.h3 id={`${id}-question`} className="workflow-style-question"
      initial={{ opacity: 0, y: reduced ? 0 : 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? .01 : .26, ease }}>How should matches appear?</motion.h3>
    <LayoutGroup id={id}>
      <div className="workflow-style-options" role="radiogroup" aria-labelledby={`${id}-question`} aria-describedby={`${id}-explanation ${id}-sample-note`}>
        {choices.map((choice, index) => {
          const selected = value === choice.mode;
          return <motion.button key={choice.mode} ref={element => { buttons.current[index] = element; }} type="button"
            role="radio" aria-checked={selected} aria-label={choice.title} tabIndex={selected ? 0 : -1}
            className={`workflow-style-tile${selected ? " is-selected" : ""}`}
            onClick={() => onChange(choice.mode)}
            onKeyDown={event => {
              let next: number;
              if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % choices.length;
              else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index + choices.length - 1) % choices.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = choices.length - 1;
              else return;
              event.preventDefault();
              onChange(choices[next].mode);
              buttons.current[next]?.focus({ preventScroll: true });
            }}
            initial={{ opacity: 0, y: reduced ? 0 : 8, filter: reduced ? "blur(0px)" : "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: reduced ? .01 : .28, delay: reduced ? 0 : index * .03, ease }}>
            {selected && <motion.div className="workflow-style-selection" layoutId="selected-email-style"
              initial={false} transition={reduced ? { duration: .01 } : { type: "spring", stiffness: 320, damping: 36, mass: .85 }}>
              <GlassSurface className="workflow-style-selected-material" variant="regular" intensity="medium" radius="lg" />
            </motion.div>}
            <GlassSurface className="workflow-style-material" variant="regular" intensity="subtle" radius="lg" interactive={!reduced}>
              <FormatPreview mode={choice.mode} samples={samples} />
              <span className="workflow-style-title"><span>{choice.title}</span>
                <motion.span className="workflow-style-check" aria-hidden="true" initial={false}
                  animate={{ opacity: selected ? 1 : 0, scale: selected || reduced ? 1 : .85 }}
                  transition={{ duration: reduced ? .01 : .16, ease }}><Check size={11} /></motion.span>
              </span>
            </GlassSurface>
          </motion.button>;
        })}
      </div>
    </LayoutGroup>
    <div id={`${id}-explanation`} className="workflow-style-explanation" aria-live="polite" aria-atomic="true">
      <AnimatePresence initial={false}>
        <motion.p key={value} initial={{ opacity: 0, y: reduced ? 0 : 3, filter: reduced ? "blur(0px)" : "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: reduced ? 0 : -3, filter: reduced ? "blur(0px)" : "blur(2px)" }}
          transition={{ duration: reduced ? .01 : .2, ease }}>{explanation}</motion.p>
      </AnimatePresence>
    </div>
    <p id={`${id}-sample-note`} className="workflow-style-sample-note">Preview only · Sample values</p>
  </section>;
}
