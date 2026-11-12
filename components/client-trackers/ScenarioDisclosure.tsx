"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Info, type LucideIcon } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";

/** Tracker-test help only: retained content, safe focus, and one local reveal adjustment. */
export default function ScenarioDisclosure({ title, description, context, name, icon: Icon = Info, className = "", children }: {
  title: string; description?: string; context?: string; name: string; icon?: LucideIcon; className?: string; children: ReactNode;
}) {
  const id = useId(), reduce = useReducedMotion();
  const [open, setOpen] = useState(false), [concealed, setConcealed] = useState(true);
  const latestOpen = useRef(false), root = useRef<HTMLElement>(null), trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null), openedAtScroll = useRef(0);
  const changeOpen = (next: boolean) => {
    if (!next && panel.current?.contains(document.activeElement)) trigger.current?.focus({ preventScroll: true });
    if (next) openedAtScroll.current = root.current?.closest<HTMLElement>(".scenario-overview-view")?.scrollTop || 0;
    latestOpen.current = next; setOpen(next);
  };
  const finishReveal = () => {
    if (!latestOpen.current) { setConcealed(true); return; }
    const section = root.current, button = trigger.current, body = panel.current;
    const port = section?.closest<HTMLElement>(".scenario-overview-view");
    if (!section || !button || !body || !port || section.closest("details:not([open])") || port.inert || port.closest("[inert]")) return;
    // Do not fight a wheel/keyboard scroll that happened while the content opened.
    if (Math.abs(port.scrollTop - openedAtScroll.current) > 2) return;
    const viewport = port.getBoundingClientRect(), heading = button.getBoundingClientRect(), content = body.getBoundingClientRect();
    const needed = content.bottom - (viewport.bottom - 16), contextRoom = Math.max(0, heading.top - viewport.top - 12);
    if (needed > 2 && contextRoom > 0) port.scrollBy({ top: Math.min(needed, contextRoom), behavior: reduce ? "auto" : "smooth" });
  };
  return <section ref={root} className={"scenario-help-disclosure " + className} data-disclosure={name} data-open={open}>
    <button ref={trigger} id={id + "-trigger"} type="button" className="scenario-disclosure-trigger" aria-expanded={open} aria-controls={id + "-content"} aria-label={context ? title + " — " + context : undefined} onClick={() => changeOpen(!latestOpen.current)}>
      <Icon size={17} aria-hidden="true" /><span><strong>{title}</strong>{description && <small>{description}</small>}</span><ChevronDown size={16} aria-hidden="true" />
    </button>
    <motion.div ref={panel} id={id + "-content"} role="region" aria-labelledby={id + "-trigger"} aria-hidden={!open || undefined} inert={!open || undefined} hidden={concealed && !open} className="scenario-disclosure-panel" initial={false}
      animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
      transition={{ height: { duration: reduce ? 0 : .24, ease: [.22, 1, .36, 1] }, opacity: { duration: reduce ? 0 : .2 } }}
      onAnimationStart={() => { if (latestOpen.current) setConcealed(false); }} onAnimationComplete={finishReveal}
      onKeyDown={event => { if (event.key === "Escape" && latestOpen.current) { event.stopPropagation(); changeOpen(false); trigger.current?.focus({ preventScroll: true }); } }}>
      <div className="scenario-disclosure-body">{children}</div>
    </motion.div>
  </section>;
}
