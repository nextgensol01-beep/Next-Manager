"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { TRACKER_EMAIL_CONTENT_RULE_LIMIT, type TrackerEmailContentRule } from "@/lib/clientTrackers";
import { snapshotDraftRule, type RemovedDraftRule } from "@/lib/tracker-email-draft-rules";

export function workflowVisibleBounds(port: HTMLElement) {
  const rect = port.getBoundingClientRect(), style = getComputedStyle(port);
  return { top: rect.top + (parseFloat(style.scrollPaddingTop) || 0) + 8, bottom: rect.bottom - (parseFloat(style.scrollPaddingBottom) || 0) - 8 };
}
type PendingRemoval = { snapshot: RemovedDraftRule; label: string; trigger: HTMLButtonElement; fingerprint: string };
type Alignment = { id: string; kind: "reveal" | "removal"; offset?: number; selector?: string };
export function useWorkflowMessageInteractions({ rules, allRules = rules, totalRuleCount = allRules.length, item, reduced, onAdd, onRemove, onRestore }: {
  rules: TrackerEmailContentRule[]; allRules?: TrackerEmailContentRule[]; totalRuleCount?: number; item: string; reduced: boolean;
  onAdd: (type: TrackerEmailContentRule["type"]) => string | null;
  onRemove: (id: string, expected?: TrackerEmailContentRule) => void;
  onRestore?: (snapshot: RemovedDraftRule) => void;
}) {
  const root = useRef<HTMLElement>(null), cards = useRef(new Map<string, HTMLElement>());
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [pending, setPending] = useState<PendingRemoval | null>(null);
  const [undoStack, setUndoStack] = useState<RemovedDraftRule[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [request, setRequest] = useState(0);
  const additions = useRef<string[]>([]), restoring = useRef<RemovedDraftRule | null>(null);
  const removing = useRef<{ pending: PendingRemoval; neighbor?: string; offset?: number } | null>(null);
  const alignment = useRef<Alignment | null>(null), frame = useRef<number | null>(null);
  const requestedFocus = useRef<{ id: string; conditionIndex?: number } | null>(null);
  const heading = (id: string) => cards.current.get(id)?.querySelector<HTMLButtonElement>(".workflow-message-expander");
  const align = useCallback(() => {
    frame.current = null;
    const operation = alignment.current; if (!operation) return;
    const node = cards.current.get(operation.id)?.querySelector<HTMLElement>(operation.selector || ".workflow-message-expander");
    const port = root.current?.closest<HTMLElement>(".tracker-email-content-scroll");
    if (!node || !port) return;
    const bounds = workflowVisibleBounds(port), rect = node.getBoundingClientRect();
    const top = operation.offset === undefined ? bounds.top : Math.max(bounds.top, Math.min(bounds.bottom - rect.height, port.getBoundingClientRect().top + operation.offset));
    const delta = rect.top - top;
    if (Math.abs(delta) > .5) port.scrollTop += delta;
  }, []);
  const schedule = useCallback(() => { if (frame.current === null && alignment.current) frame.current = requestAnimationFrame(align); }, [align]);
  useLayoutEffect(() => {
    setHost(root.current?.closest<HTMLElement>(".tracker-email-editor") || null);
    const node = root.current; if (!node) return;
    const observer = new ResizeObserver(schedule); observer.observe(node);
    const port = node.closest<HTMLElement>(".tracker-email-content-scroll");
    port?.addEventListener("scroll", schedule, { passive: true });
    const cancel = () => { alignment.current = null; };
    port?.addEventListener("wheel", cancel, { passive: true });
    return () => { observer.disconnect(); port?.removeEventListener("scroll", schedule); port?.removeEventListener("wheel", cancel); if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, [schedule]);
  useLayoutEffect(() => {
    if (requestedFocus.current) {
      const target = requestedFocus.current, card = cards.current.get(target.id);
      if (card) {
        const row = `[data-condition-index="${target.conditionIndex}"]`;
        const selector = target.conditionIndex === undefined ? ".workflow-message-expander" : card.querySelector(`${row} [aria-invalid="true"]`) ? `${row} [aria-invalid="true"]` : `${row} :is(button,input)`;
        const control = card.querySelector<HTMLElement>(selector);
        if (control && !control.closest("[inert]")) { requestedFocus.current = null; control.focus({ preventScroll: true }); alignment.current = { id: target.id, kind: "reveal", selector }; align(); }
      }
    }
    if (pending && (!rules.some(rule => rule.id === pending.snapshot.rule.id && JSON.stringify(rule) === pending.fingerprint))) {
      const inConfirmation = document.activeElement?.closest(".workflow-message-delete-popover");
      setPending(null); if (inConfirmation && pending.trigger.isConnected) pending.trigger.focus({ preventScroll: true });
    }
    const removal = removing.current;
    if (removal && !rules.some(rule => rule.id === removal.pending.snapshot.rule.id)) {
      removing.current = null;
      if (onRestore) setUndoStack(current => [...current, removal.pending.snapshot].slice(-TRACKER_EMAIL_CONTENT_RULE_LIMIT));
      setAnnouncement(`${removal.pending.label} removed from draft.`); setFeedback(`${item} removed from draft.`);
      if (removal.neighbor && heading(removal.neighbor)) {
        alignment.current = { id: removal.neighbor, kind: "removal", offset: removal.offset };
        heading(removal.neighbor)?.focus({ preventScroll: true }); align();
      } else root.current?.querySelector<HTMLButtonElement>(".workflow-message-add")?.focus({ preventScroll: true });
    } else if (removal && rules.some(rule => rule.id === removal.pending.snapshot.rule.id && JSON.stringify(rule) !== removal.pending.fingerprint)) {
      removing.current = null; setFeedback(`${item} changed. Review it before removing.`);
    }
    const mounted = additions.current.filter(id => rules.some(rule => rule.id === id) && cards.current.has(id));
    const target = mounted.at(-1);
    if (target) {
      const restore = restoring.current?.rule.id === target;
      if (restore) { restoring.current = null; setUndoStack(current => current.slice(0, -1)); setFeedback(""); }
      setHighlighted(target); setAnnouncement(`${item} ${rules.findIndex(rule => rule.id === target) + 1} ${restore ? "restored" : "added"}.`);
      alignment.current = { id: target, kind: "reveal" }; heading(target)?.focus({ preventScroll: true }); align();
      additions.current = additions.current.filter(id => !mounted.includes(id));
    }
    if (totalRuleCount >= TRACKER_EMAIL_CONTENT_RULE_LIMIT && additions.current.length) {
      additions.current = []; setFeedback(`The ${TRACKER_EMAIL_CONTENT_RULE_LIMIT}-message limit has been reached.`);
    }
  }, [rules, pending, request, totalRuleCount, item, onRestore, align]);
  return {
    root, host, highlighted, setHighlighted, pending, announcement, feedback, undoAvailable: undoStack.length > 0,
    canAdd: totalRuleCount < TRACKER_EMAIL_CONTENT_RULE_LIMIT,
    bindCard: (id: string, node: HTMLElement | null) => { if (node) cards.current.set(id, node); else cards.current.delete(id); },
    revealRule: (id: string, conditionIndex?: number) => { requestedFocus.current = { id, conditionIndex }; setRequest(value => value + 1); },
    finishLayout: (id?: string) => {
      const operation = alignment.current;
      if (operation && (id ? operation.kind === "reveal" && operation.id === id : operation.kind === "removal")) { align(); alignment.current = null; }
    },
    cancelReveal: (target: EventTarget) => { if (target instanceof Element && !target.closest(".workflow-message-add,.workflow-message-undo")) alignment.current = null; },
    add: (type: TrackerEmailContentRule["type"]) => {
      if (totalRuleCount >= TRACKER_EMAIL_CONTENT_RULE_LIMIT) { setFeedback(`The ${TRACKER_EMAIL_CONTENT_RULE_LIMIT}-message limit has been reached.`); return null; }
      const id = onAdd(type); if (!id) return null;
      additions.current.push(id); setRequest(value => value + 1); return id;
    },
    requestRemoval: (rule: TrackerEmailContentRule, index: number, trigger: HTMLButtonElement) => {
      const snapshot = snapshotDraftRule(allRules, rule.id); if (!snapshot) return;
      setPending({ snapshot, label: `${item} ${index + 1}${rule.name ? ` — ${rule.name}` : ""}`, trigger, fingerprint: JSON.stringify(rule) });
    },
    cancelRemoval: (restoreFocus = true) => { if (restoreFocus && pending?.trigger.isConnected) pending.trigger.focus({ preventScroll: true }); setPending(null); },
    confirmRemoval: () => {
      if (!pending) return;
      const index = rules.findIndex(rule => rule.id === pending.snapshot.rule.id);
      const current = rules[index];
      if (!current || JSON.stringify(current) !== pending.fingerprint) { setPending(null); return; }
      const neighbor = rules[index + 1] || rules[index - 1], node = neighbor && heading(neighbor.id);
      const port = root.current?.closest<HTMLElement>(".tracker-email-content-scroll");
      removing.current = { pending, neighbor: neighbor?.id, offset: node && port ? node.getBoundingClientRect().top - port.getBoundingClientRect().top : undefined };
      onRemove(current.id, pending.snapshot.rule); setPending(null);
    },
    undo: () => {
      const snapshot = undoStack.at(-1); if (!snapshot || !onRestore) return;
      if (totalRuleCount >= TRACKER_EMAIL_CONTENT_RULE_LIMIT) { setFeedback("Remove another message before undoing: the message limit is reached."); return; }
      if (allRules.some(rule => rule.id === snapshot.rule.id)) { setUndoStack(current => current.slice(0, -1)); setFeedback("This message is already in the draft."); return; }
      restoring.current = snapshot; additions.current.push(snapshot.rule.id); onRestore(snapshot); setRequest(value => value + 1);
    },
    dismissFeedback: () => setFeedback(""), reduced,
  };
}
