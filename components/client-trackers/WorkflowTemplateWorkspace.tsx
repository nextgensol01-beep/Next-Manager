"use client";

import React, { useEffect, useId, useRef } from "react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { Mail } from "lucide-react";
import { TRACKER_EMAIL_PRESETS } from "@/lib/clientTrackers";
import RichTextEditor, { type EmailEditorVariable } from "./TrackerRichTextEditor";

export default function WorkflowTemplateWorkspace({ subject, body, variables, onChange }: {
  subject: string; body: string; variables: EmailEditorVariable[];
  onChange: (patch: { subject?: string; body?: string }) => void;
}) {
  const id = useId(), reduced = useReducedMotion();
  const workspace = useRef<HTMLDivElement>(null);
  const effects = useRef<(() => void)[]>([]);
  const wasEditing = useRef(false);
  const selected = TRACKER_EMAIL_PRESETS.find(preset => preset.subject === subject && preset.body === body)?.id;
  const clearEffects = () => { effects.current.forEach(clear => clear()); effects.current = []; };
  useEffect(() => () => { effects.current.forEach(clear => clear()); }, []);

  // A decorative snapshot fades away over the new transaction-backed document.
  // The live editor stays mounted, and applying a preset still updates state immediately.
  const transitionContent = (field: "subject" | "body", delay: number) => {
    const content = workspace.current?.querySelector<HTMLElement>(`.workflow-template-${field} .tracker-rich-text-content`);
    if (!content) return;
    const previous = content.cloneNode(true) as HTMLElement;
    previous.classList.add("workflow-template-previous");
    previous.style.top = `${content.offsetTop}px`; previous.style.left = `${content.offsetLeft}px`; previous.style.width = `${content.offsetWidth}px`;
    previous.setAttribute("aria-hidden", "true"); previous.inert = true;
    previous.removeAttribute("id");
    previous.querySelectorAll<HTMLElement>("[contenteditable], [id], [role], [tabindex]").forEach(node => {
      node.removeAttribute("id"); node.removeAttribute("role"); node.removeAttribute("tabindex"); node.setAttribute("contenteditable", "false");
    });
    content.parentElement?.append(previous);
    const oldEffect = previous.animate([{ opacity: 1, filter: "blur(0px)" }, { opacity: 0, filter: "blur(2px)" }], { duration: 100, delay, fill: "both", easing: "ease-in" });
    const newEffect = content.animate([
      { opacity: 0, filter: "blur(2px)", transform: field === "subject" ? "translateY(2px)" : "none" },
      { opacity: 1, filter: "blur(0px)", transform: "none" },
    ], { duration: 140, delay: delay + 80, fill: "both", easing: "cubic-bezier(.2,.7,.2,1)" });
    const clear = () => { previous.remove(); oldEffect.cancel(); newEffect.cancel(); };
    effects.current.push(clear);
    newEffect.onfinish = clear;
  };
  const applyPreset = (preset: typeof TRACKER_EMAIL_PRESETS[number]) => {
    clearEffects();
    if (!reduced && !wasEditing.current && !workspace.current?.querySelector(".tracker-rich-text:focus")) {
      transitionContent("subject", 0); transitionContent("body", 50);
    }
    onChange({ subject: preset.subject, body: preset.body });
  };
  const stopMotionWhileWriting = () => {
    clearEffects(); workspace.current?.classList.add("is-writing");
  };

  return <div ref={workspace} className="workflow-template-workspace"
    onBeforeInputCapture={stopMotionWhileWriting} onCompositionStartCapture={stopMotionWhileWriting}
    onPointerDownCapture={event => { if ((event.target as HTMLElement).closest(".tracker-rich-text")) stopMotionWhileWriting(); }}>
    <div className="workflow-template-intro">
      <h3><Mail size={16} aria-hidden="true" />Common email template</h3>
      <p>Shared with every eligible client. Matching messages are added automatically.</p>
    </div>
    <LayoutGroup id={id}>
      <div className="workflow-template-presets" role="group" aria-label="Template presets">
        {TRACKER_EMAIL_PRESETS.map(preset => <motion.button key={preset.id} type="button" className="workflow-template-preset"
          aria-pressed={selected === preset.id}
          onPointerDown={() => { wasEditing.current = Boolean(document.activeElement?.closest(".tracker-rich-text")); }}
          onKeyDown={() => { wasEditing.current = false; }}
          onClick={() => applyPreset(preset)}
          whileHover={reduced ? undefined : { y: -1, scale: 1.01 }}
          whileTap={reduced ? undefined : { scale: .98 }} transition={{ duration: .08 }}>
          {selected === preset.id && <motion.span className="workflow-template-preset-material" layoutId="template-preset-material"
            transition={reduced ? { duration: 0 } : { duration: .24, ease: [.2, .75, .25, 1] }} />}
          <span className="workflow-template-preset-name">{preset.name}</span>
        </motion.button>)}
      </div>
    </LayoutGroup>
    <section className="workflow-template-subject" aria-labelledby={`${id}-subject`}>
      <h4 id={`${id}-subject`}>Subject</h4>
      <RichTextEditor singleLine value={subject} onChange={value => onChange({ subject: value })} variables={variables}
        label="Email subject" labelledBy={`${id}-subject`} placeholder="Add an email subject…" />
    </section>
    <section className="workflow-template-body" aria-labelledby={`${id}-message`}>
      <h4 id={`${id}-message`}>Message</h4>
      <RichTextEditor value={body} onChange={value => onChange({ body: value })} variables={variables}
        label="Shared email body" labelledBy={`${id}-message`} placeholder="Write the shared email content…" />
    </section>
  </div>;
}
