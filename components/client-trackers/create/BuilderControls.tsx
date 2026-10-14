"use client";

import { useId, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { GlassSurface } from "@/components/ui/liquid-glass/GlassSurface";

export function BuilderChoices({ label, value, options, onChange, className = "", descriptionId, invalid }: {
  label: string; value: string;
  options: { value: string; label: string; description?: string; icon?: ReactNode }[];
  onChange: (value: string) => void; className?: string; descriptionId?: string; invalid?: boolean;
}) {
  const id = useId(), reduceMotion = useReducedMotion();
  return <div role="radiogroup" aria-label={label} aria-describedby={descriptionId} aria-invalid={invalid} className={`create-choices ${className}`}>
    {options.map((option, index) => <button type="button" key={option.value} role="radio"
      aria-checked={value === option.value} tabIndex={value === option.value ? 0 : -1}
      className={`create-choice ${value === option.value ? "is-selected" : ""}`}
      onClick={() => onChange(option.value)} onKeyDown={event => {
        const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 0;
        if (!direction && event.key !== "Home" && event.key !== "End") return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + direction + options.length) % options.length;
        onChange(options[next].value);
        (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus({ preventScroll: true });
      }}>
      {value === option.value && <motion.div className="create-choice-selection" layoutId={`${id}-selection`}
        transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}><GlassSurface intensity="subtle" radius="md" /></motion.div>}
      <span className="create-choice-content">{option.icon}<span>{option.label}{option.description && <small>{option.description}</small>}</span></span>
    </button>)}
  </div>;
}

export function BuilderSection({ title, description, children, className = "" }: {
  title: string; description?: string; children: ReactNode; className?: string;
}) {
  const id = useId();
  return <section className={`create-section ${className}`} aria-labelledby={id}>
    <div className="create-section-heading"><h4 id={id}>{title}</h4>{description && <p>{description}</p>}</div>
    {children}
  </section>;
}

export function BuilderError({ id, children }: { id: string; children?: string }) {
  return children ? <p className="create-error" id={id}>{children}</p> : null;
}
