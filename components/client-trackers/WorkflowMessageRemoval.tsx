"use client";

import { useId, useLayoutEffect, useRef } from "react";
import { workflowVisibleBounds } from "./useWorkflowMessageInteractions";

export default function WorkflowMessageRemoval({ label, item, trigger, onCancel, onDismiss, onConfirm }: {
  label: string; item: string; trigger: HTMLButtonElement; onCancel: () => void; onDismiss: () => void; onConfirm: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null), keep = useRef<HTMLButtonElement>(null), id = useId();
  const cancel = useRef(onCancel); cancel.current = onCancel;
  useLayoutEffect(() => {
    const node = ref.current; if (!node) return;
    const position = () => {
      if (!trigger.isConnected) { cancel.current(); return; }
      const anchor = trigger.getBoundingClientRect(), port = trigger.closest<HTMLElement>(".tracker-email-content-scroll");
      const bounds = port ? workflowVisibleBounds(port) : { top: 12, bottom: innerHeight - 12 };
      const width = Math.min(320, innerWidth - 24); node.style.width = `${width}px`;
      const left = Math.max(12, Math.min(innerWidth - width - 12, anchor.right - width));
      const height = node.offsetHeight, below = anchor.bottom + 8;
      node.style.left = `${left}px`; node.style.top = `${Math.max(bounds.top, Math.min(bounds.bottom - height, below + height <= bounds.bottom ? below : anchor.top - height - 8))}px`;
    };
    node.showPopover(); position(); keep.current?.focus({ preventScroll: true });
    const observer = new ResizeObserver(position); observer.observe(node);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); cancel.current(); }
    };
    window.addEventListener("keydown", keydown, true); window.addEventListener("resize", position); document.addEventListener("scroll", position, true);
    return () => { observer.disconnect(); window.removeEventListener("keydown", keydown, true); window.removeEventListener("resize", position); document.removeEventListener("scroll", position, true); if (node.matches(":popover-open")) node.hidePopover(); };
  }, [trigger]);
  return <div ref={ref} popover="auto" role="dialog" aria-modal="false" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} className="workflow-message-delete-popover"
    onToggle={event => { if (event.newState === "closed" && !event.currentTarget.matches(":popover-open")) onDismiss(); }}>
    <strong id={`${id}-title`}>Remove {label}?</strong>
    <p id={`${id}-description`}>Its conditions and message content will be removed from this draft. Save Email Updates commits the change.</p>
    <div><button ref={keep} type="button" aria-label={`Keep ${label}`} onClick={onCancel}>Keep {item.toLowerCase()}</button>
      <button type="button" className="is-destructive" aria-label={`Remove ${label} from draft`} onClick={onConfirm}>Remove {item.toLowerCase()}</button></div>
  </div>;
}
