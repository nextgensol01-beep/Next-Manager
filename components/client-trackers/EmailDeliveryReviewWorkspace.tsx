"use client";

import React, { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { animate, AnimatePresence, LayoutGroup, motion, useAnimate, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ArrowLeft, ArrowUpRight, CircleAlert, FileText, Mail, Maximize2, Paperclip, Plus, RefreshCw, Search, Send, Users, X } from "lucide-react";
import TrackerModal from "@/components/client-trackers/TrackerModal";
import LiquidGlassDropdown from "@/components/ui/LiquidGlassDropdown";
import { GlassButton, GlassSurface } from "@/components/ui/liquid-glass";
import type { TrackerEmailWorkflow } from "@/lib/clientTrackers";
import { createSearchMatcher } from "@/lib/search/client-search";
import { skipReasonGroups, skipReasonKey } from "@/lib/email-skip-reasons";
import { getAdditionalRecipients, initialRecipientDraft, MAX_ADDITIONAL_RECIPIENTS, previewWithGmailSignature, recipientCount, recipientIssue, updateAdditionalRecipients, type EmailPreparationPhase, type EmailPreview, type RecipientDraft } from "@/lib/tracker-email-delivery-review";
import EmailPreviewFrame from "./EmailPreviewFrame";
import { emailMotion } from "./EmailMotionRegion";
import { useAuthorizationReducedMotion as useReducedMotion } from "./useAuthorizationReducedMotion";

type Props = {
  open: boolean; onClose: () => void;
  interactionLocked?: boolean;
  workflows: TrackerEmailWorkflow[]; workflowId: string; kind: "initial" | "reminder";
  onWorkflow: (id: string) => void; onKind: (kind: "initial" | "reminder") => void;
  selectedCount: number; clientCategories: Record<string, string>;
  preview: EmailPreview | null; drafts: Record<string, RecipientDraft>;
  onDraft: (id: string, draft: RecipientDraft) => void;
  busy: boolean; phase: EmailPreparationPhase; deliveryMode: "draft" | "send" | null;
  error: string | null; onPrepare: () => void;
  onDrafts: () => void; onSend: () => void;
  signature: string | null; signatureLoading: boolean;
  onExpand: (message: EmailPreview["messages"][number]) => void;
};

const ease = emailMotion.ease;

/** Local material only; activation stays at the existing confirmation boundary. */
function TransmissionSendButton({ count, disabled, suspended, onClick }: { count: number; disabled: boolean; suspended?: boolean; onClick: () => void }) {
  const reduced = useReducedMotion();
  // Match LiquidNavControl's local coordinates, spring character and physical limits.
  const pointerX = useMotionValue(0), pointerY = useMotionValue(0);
  const x = useSpring(pointerX, { stiffness: 190, damping: 28 });
  const y = useSpring(pointerY, { stiffness: 190, damping: 28 });
  const activeTarget = useMotionValue(0), pressTarget = useMotionValue(0);
  const active = useSpring(activeTarget, { stiffness: 190, damping: 28 });
  const press = useSpring(pressTarget, { stiffness: 380, damping: 40 });
  const idlePhase = useMotionValue(0);
  const magneticX = useTransform([x, press], ([value, pressed]) => Math.max(-3, Math.min(3, Number(value) * 3 * (1 - Number(pressed) * .7))));
  const magneticY = useTransform([y, press], ([value, pressed]) => Math.max(-2, Math.min(2, Number(value) * 2 * (1 - Number(pressed) * .7))));
  const scale = useTransform(press, value => 1 - value * .022);
  // Independent harmonics mix slowly at rest; hover progressively gives the cursor control.
  const lightX = useTransform([x, active, press, idlePhase], ([value, awake, pressed, phase]) => `${68 + (1 - Number(awake)) * (1 - Number(pressed)) * Math.sin(Number(phase) * 2) * 6 + Number(awake) * (50 + Number(value) * 24 - 68) - Number(pressed) * 12}%`);
  const lightY = useTransform([y, active, press, idlePhase], ([value, awake, pressed, phase]) => `${23 + (1 - Number(awake)) * (1 - Number(pressed)) * Math.sin(Number(phase) * 3) * 5 + Number(awake) * (50 + Number(value) * 28 - 23) - Number(pressed) * 8}%`);
  const blueX = useTransform([x, active, idlePhase], ([value, awake, phase]) => `${46 + (1 - Number(awake)) * Math.sin(Number(phase) * 3) * 3 + Number(awake) * Number(value) * 15}%`);
  const blueY = useTransform([y, active, idlePhase], ([value, awake, phase]) => `${52 + (1 - Number(awake)) * Math.sin(Number(phase) * 2) * 4 + Number(awake) * Number(value) * 17}%`);
  const violetX = useTransform([x, active, idlePhase], ([value, awake, phase]) => `${18 - (1 - Number(awake)) * Math.sin(Number(phase) * 2) * 4 - Number(awake) * Number(value) * 8}%`);
  const violetY = useTransform([y, active, idlePhase], ([value, awake, phase]) => `${69 + (1 - Number(awake)) * Math.sin(Number(phase) * 3) * 3 - Number(awake) * Number(value) * 9}%`);
  const specularY = useTransform([y, active, idlePhase], ([value, awake, phase]) => `${7 + (1 - Number(awake)) * Math.sin(Number(phase) * 4) * 2 + Number(awake) * (8 + Number(value) * 9)}%`);
  const planeX = useTransform([x, active, press], ([value, awake, pressed]) => (Number(value) * .65 + Number(awake) * 1.75) * (1 - Number(pressed)));
  const planeY = useTransform([y, active, press], ([value, awake, pressed]) => (Number(value) * .3 - Number(awake) * .6) * (1 - Number(pressed)));
  const [hovered, setHovered] = useState(false);
  const [keyboardPressed, setKeyboardPressed] = useState(false);
  const updatePointer = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || reduced || event.pointerType === "touch") return;
    // Re-awaken when a busy button becomes enabled beneath an existing hover.
    activeTarget.set(1);
    const rect = event.currentTarget.getBoundingClientRect();
    pointerX.set(Math.max(-1, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width) * 2 - 1)));
    pointerY.set(Math.max(-1, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height) * 2 - 1)));
  };
  const leave = () => { setHovered(false); activeTarget.set(0); pointerX.set(0); pointerY.set(0); pressTarget.set(0); };
  useEffect(() => {
    if (disabled || reduced || suspended) { idlePhase.set(0); return; }
    const drift = animate(idlePhase, Math.PI * 2, { duration: 48, repeat: Infinity, ease: "linear" });
    const visibility = () => { if (document.hidden) drift.pause(); else drift.play(); };
    visibility(); document.addEventListener("visibilitychange", visibility);
    return () => { drift.stop(); document.removeEventListener("visibilitychange", visibility); };
  }, [disabled, reduced, suspended, idlePhase]);
  useEffect(() => {
    if (!disabled && !reduced) return;
    pointerX.set(0); pointerY.set(0); activeTarget.set(0); pressTarget.set(0);
    x.jump(0); y.jump(0); active.jump(0); press.jump(0);
    setHovered(false); setKeyboardPressed(false);
  }, [disabled, reduced, pointerX, pointerY, activeTarget, pressTarget, x, y, active, press]);
  return <motion.button type="button" onClick={onClick} disabled={disabled}
    className="email-review-send glass-surface" data-pointer-active={hovered && !disabled ? "true" : undefined}
    data-pressed={keyboardPressed && !disabled ? "true" : undefined}
    style={{ x: reduced || disabled ? 0 : magneticX, y: reduced || disabled ? 0 : magneticY, scale: reduced || disabled ? 1 : scale }}
    onPointerEnter={event => { if (!disabled && event.pointerType !== "touch") { setHovered(true); if (!reduced) activeTarget.set(1); updatePointer(event); } }}
    onPointerMove={updatePointer} onPointerLeave={leave} onPointerCancel={leave}
    onPointerDown={event => { if (!disabled && event.button === 0) pressTarget.set(1); }}
    onPointerUp={() => pressTarget.set(0)}
    onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { setKeyboardPressed(true); pressTarget.set(1); } }}
    onKeyUp={() => { setKeyboardPressed(false); pressTarget.set(0); }}
    onBlur={() => { setKeyboardPressed(false); pressTarget.set(0); }}>
    <motion.span className="email-review-transmission-material" aria-hidden="true" style={{
      "--send-light-x": lightX, "--send-light-y": lightY, "--send-blue-x": blueX, "--send-blue-y": blueY,
      "--send-violet-x": violetX, "--send-violet-y": violetY, "--send-specular-y": specularY,
      "--send-idle-phase": idlePhase, "--send-compression": press,
    } as React.CSSProperties}>
      <span className="email-review-transmission-depth" />
      <span className="email-review-transmission-blue" />
      <span className="email-review-transmission-violet" />
      <span className="email-review-transmission-cyan" />
      <span className="email-review-transmission-shell" />
      <span className="email-review-transmission-specular" />
    </motion.span>
    <span className="email-review-transmission-copy"><motion.span className="email-review-transmission-plane" style={{ x: reduced ? 0 : planeX, y: reduced ? 0 : planeY }}><Send size={15} /></motion.span>Send {count} emails</span>
  </motion.button>;
}

function SegmentedControl({ label, options, value, onChange, disabled = false, compact = false }: {
  label: string; options: Array<{ value: string; label: string }>; value: string;
  onChange: (value: string) => void; disabled?: boolean; compact?: boolean;
}) {
  const id = useId(), reduced = useReducedMotion();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  return <LayoutGroup id={id}><GlassSurface radius="pill" intensity="subtle" className={`email-review-segments ${compact ? "is-compact" : ""}`} role="radiogroup" aria-label={label}>
    {options.map((option, index) => <button key={option.value} ref={node => { buttons.current[index] = node; }} type="button" role="radio"
      aria-label={option.value === "none" ? "Not included" : option.label} aria-checked={value === option.value} tabIndex={value === option.value ? 0 : -1} disabled={disabled}
      onClick={() => onChange(option.value)}
      onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + options.length) % options.length;
        onChange(options[next].value); buttons.current[next]?.focus();
      }}>
      {value === option.value && <motion.span className="email-review-selection glass-surface glass-surface--clear glass-surface--subtle" aria-hidden="true" layoutId="selection"
        initial={false} animate={{ scaleY: reduced ? 1 : [1, 0.94, 1] }} transition={{ duration: reduced ? 0 : 0.25, ease, layout: { type: "spring", stiffness: 540, damping: 44, mass: 0.8 } }} />}
      <span>{option.label}</span>
    </button>)}
  </GlassSurface></LayoutGroup>;
}

// A local, stronger version of the existing violet/blue/cyan dye-body language.
// CSS animation stays outside React; phase-copy changes never restart the bodies.
function PrepareAction({ busy, phase, kind, refresh, disabled, onClick }: {
  busy: boolean; phase: EmailPreparationPhase; kind: Props["kind"];
  refresh: boolean; disabled: boolean; onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const reduced = useReducedMotion();
  const text = busy ? phase === "replies" ? "Checking reply status…" : kind === "reminder" ? "Preparing recipients…" : "Preparing eligible clients…" : refresh ? "Refresh preview" : "Preview eligible clients";
  return <motion.button type="button" disabled={disabled || busy} onClick={onClick} aria-busy={busy}
    className={`email-review-prepare-action glass-surface glass-surface--clear glass-surface--pill ${busy ? "email-client-processing" : ""}`}
    layout layoutId="email-preview-action" whileTap={reduced ? undefined : { scale: 0.97 }}
    animate={{ minWidth: busy ? 292 : refresh ? 148 : 232, scale: busy && !reduced ? [0.97, 1] : 1 }} transition={{ duration: reduced ? 0 : 0.26, ease }}>
    <span className="email-review-processing-material" aria-hidden="true">
      {["violet", "blue", "cyan", "pink"].map(color => <span key={color} className={`email-review-processing-body is-${color}`} />)}
      <span className="email-review-processing-rim" />
    </span>
    <span className="email-review-prepare-copy" aria-live="polite" aria-atomic="true">
      {busy ? <span className="email-review-working-orbit" aria-hidden="true" /> : refresh ? <RefreshCw size={15} /> : <FileText size={16} />}
      <AnimatePresence mode="wait" initial={false}><motion.span key={text} initial={{ opacity: 0, y: reduced ? 0 : 3, filter: reduced ? "none" : "blur(2px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: reduced ? 0 : -3, filter: reduced ? "none" : "blur(2px)" }} transition={{ duration: reduced ? 0 : 0.1 }}>{text}</motion.span></AnimatePresence>
    </span>
  </motion.button>;
}

const ClientRecipientReview = memo(function ClientRecipientReview({ message, draft, kind, disabled, signature, signatureLoading, signatureGap, onChange, onExpand }: {
  message: EmailPreview["messages"][number]; draft: RecipientDraft; kind: Props["kind"]; disabled: boolean;
  signature: string | null; signatureLoading: boolean; signatureGap: number;
  onChange: (draft: RecipientDraft) => void; onExpand: () => void;
}) {
  const additional = getAdditionalRecipients(draft);
  const additionalId = useId(), additionalSequence = useRef(0);
  const pendingAdditionalFocus = useRef<string | null>(null);
  const addRecipientButton = useRef<HTMLButtonElement>(null);
  const focusAddAfterRemoval = useRef(false);
  useLayoutEffect(() => {
    pendingAdditionalFocus.current = null;
    focusAddAfterRemoval.current = false;
  }, [message.entryId]);
  useEffect(() => {
    if (focusAddAfterRemoval.current) { addRecipientButton.current?.focus(); focusAddAfterRemoval.current = false; }
  }, [draft]);
  const addRecipient = () => {
    if (disabled || additional.length >= MAX_ADDITIONAL_RECIPIENTS) return;
    const id = `${additionalId}-${++additionalSequence.current}`;
    pendingAdditionalFocus.current = id;
    onChange(updateAdditionalRecipients(draft, [...additional, { id, email: "", kind: "to" }]));
  };
  const issue = recipientIssue(draft);
  const html = useMemo(() => previewWithGmailSignature(message.html, signature, signatureGap), [message.html, signature, signatureGap]);
  return <>
    <div className="email-review-client-heading">
      <div><span className="email-review-eyebrow">Client delivery review</span><h2>{message.companyName}</h2><p>{message.clientId} <span aria-hidden="true">·</span> {kind === "initial" ? "Initial email" : "Reminder"}</p></div>
      <span className={`email-review-status ${issue ? "needs-attention" : "is-ready"}`}><i />{issue ? "Needs attention" : "Ready"}</span>
    </div>
    <section className="email-review-recipients" aria-label={`Recipients for ${message.companyName}`}>
      <div className="email-review-section-title"><h3>Recipients</h3><span>{recipientCount(draft)} included</span></div>
      {message.recipients.map(recipient => {
        const assigned = draft.to.includes(recipient.email) ? "to" : draft.cc.includes(recipient.email) ? "cc" : "none";
        return <div key={recipient.email} className="email-review-recipient">
          <div className="email-review-contact-avatar" aria-hidden="true">{recipient.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "C"}</div>
          <div className="email-review-recipient-copy"><strong>{recipient.name}</strong><span title={recipient.email}>{recipient.email}</span>{recipient.designation && <small>{recipient.designation}</small>}</div>
          <SegmentedControl compact label={`Assignment for ${recipient.email}`} value={assigned} disabled={disabled}
            options={[{ value: "to", label: "To" }, { value: "cc", label: "CC" }, { value: "none", label: "—" }]}
            onChange={value => onChange({ ...draft, to: value === "to" ? [...draft.to.filter(email => email !== recipient.email), recipient.email] : draft.to.filter(email => email !== recipient.email),
              cc: value === "cc" ? [...draft.cc.filter(email => email !== recipient.email), recipient.email] : draft.cc.filter(email => email !== recipient.email) })} />
        </div>;
      })}
      {additional.length > 0 && <div className="email-review-additional">
        <div className="email-review-additional-heading"><h4>Additional recipients</h4><span>{additional.length} / {MAX_ADDITIONAL_RECIPIENTS}</span></div>
        {additional.map((row, index) => <div className="email-review-additional-row" key={row.id}>
          <label>Email {index + 1}<input type="email" aria-label={`Additional recipient ${index + 1} email`} value={row.email} disabled={disabled} placeholder="client@example.com"
            ref={node => { if (node && pendingAdditionalFocus.current === row.id) { node.focus(); pendingAdditionalFocus.current = null; } }}
            onChange={event => onChange(updateAdditionalRecipients(draft, additional.map(current => current.id === row.id ? { ...current, email: event.target.value } : current)))} /></label>
          <SegmentedControl compact label={`Delivery for additional recipient ${index + 1}`} value={row.kind} disabled={disabled}
            options={[{ value: "to", label: "To" }, { value: "cc", label: "CC" }]}
            onChange={value => onChange(updateAdditionalRecipients(draft, additional.map(current => current.id === row.id ? { ...current, kind: value as "to" | "cc" } : current)))} />
          <button type="button" className="email-review-remove-recipient" aria-label={`Remove additional recipient ${index + 1}`} disabled={disabled}
            onClick={() => { focusAddAfterRemoval.current = true; onChange(updateAdditionalRecipients(draft, additional.filter(current => current.id !== row.id))); }}><X size={15} /></button>
        </div>)}
      </div>}
      <button ref={addRecipientButton} type="button" className="email-review-add-recipient" onClick={addRecipient} disabled={disabled || additional.length >= MAX_ADDITIONAL_RECIPIENTS}><Plus size={15} /> Add another recipient</button>
      <p className="email-review-additional-limit" role="status">{additional.length >= MAX_ADDITIONAL_RECIPIENTS ? "Limit reached. Remove a recipient to add another." : `Up to ${MAX_ADDITIONAL_RECIPIENTS} additional recipients per client.`}</p>
      {issue && <p role="status" className="email-review-recipient-issue"><CircleAlert size={14} />{issue}</p>}
    </section>
    <section className="email-review-mail" aria-label="Personalised email preview">
      <div className="email-review-section-title"><h3>Email preview</h3><button type="button" aria-label="Expand email preview" onClick={onExpand}><Maximize2 size={15} /></button></div>
      <div className="email-review-subject"><span>Subject</span><p>{message.subject}</p></div>
      <div className="email-review-mail-sheet glass-surface glass-surface--clear glass-surface--lg">
        <div className="email-review-mail-sheet-bar"><Mail size={13} /><span>Personalised message</span><span>{signatureLoading ? "Loading signature…" : signature ? "Gmail signature included" : "Email body"}</span></div>
        <EmailPreviewFrame title={`Email for ${message.companyName}`} html={html} />
      </div>
      <p className="email-review-signature-note">{signatureLoading ? "Loading the configured Gmail signature…" : signature ? `The Gmail signature follows ${signatureGap} blank line${signatureGap === 1 ? "" : "s"}, matching delivery.` : "A Gmail signature will appear when one is configured."}</p>
      {(message.combinationMessage || message.statements?.length || message.points.length || message.attachments.length || message.attachmentWarnings?.length) ? <div className="email-review-personalisation">
        <p>{[message.combinationMessage ? "Combination matched" : null, message.statements?.length ? `${message.statements.length} statement${message.statements.length === 1 ? "" : "s"}` : null,
          message.points.length ? `${message.points.length} point${message.points.length === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}</p>
        {message.attachments.map(file => <p key={file.documentId} className="email-review-attachments"><Paperclip size={13} /><span>{file.filename}<br /><span className="text-xs text-muted">{[file.category ? file.category[0].toUpperCase() + file.category.slice(1) : null, file.financialYear ? `FY ${file.financialYear}` : null, file.fileSize < 1024 * 1024 ? `${(file.fileSize / 1024).toFixed(1)} KB` : `${(file.fileSize / (1024 * 1024)).toFixed(1)} MB`, typeof file.required === "boolean" ? file.required ? "Required" : "Optional" : null].filter(Boolean).join(" · ")}</span></span></p>)}
        {message.attachmentWarnings?.map((warning, index) => <p key={`${warning.ruleId}-${index}`} className="email-review-recipient-issue" role="status"><CircleAlert size={14} />{warning.message}</p>)}
      </div> : null}
    </section>
  </>;
});

export default function EmailDeliveryReviewWorkspace(props: Props) {
  const { open, preview, busy, phase } = props;
  const reduced = useReducedMotion(), group = useId();
  const [tab, setTab] = useState("eligible"), [search, setSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState("");
  const [selected, setSelected] = useState(""), [mobileDetail, setMobileDetail] = useState(false);
  const [previousPreview, setPreviousPreview] = useState(false);
  const [detailScope, animateDetail] = useAnimate();
  const keyboardPreparation = useRef(false);
  const audienceRows = useRef(new Map<string, HTMLButtonElement>());
  const preparing = phase !== null;
  useLayoutEffect(() => {
    setReasonFilter("");
    if (!open) { setPreviousPreview(false); setSearch(""); setMobileDetail(false); setSelected(""); return; }
    if (!preview) { setMobileDetail(false); return; }
    setPreviousPreview(true);
    setTab(preview.messages.length ? "eligible" : "skipped");
    setSelected(current => preview.messages.some(message => message.entryId === current) ? current : preview.messages[0]?.entryId || (preview.skipped[0] ? `skipped:${preview.skipped[0].clientId}:0` : ""));
  }, [open, preview]);
  useEffect(() => {
    if (!detailScope.current) return;
    const animation = animateDetail(detailScope.current, { opacity: reduced ? [1, 1] : [.55, 1], x: reduced ? [0, 0] : [8, 0] }, { duration: reduced ? 0 : emailMotion.content, ease });
    return () => animation.stop();
  }, [selected, tab, preview, open, reduced, detailScope, animateDetail]);
  const messageIndex = useMemo(() => new Map((preview?.messages || []).map(message => [message.entryId, message])), [preview]);
  const preparedCategories = useMemo(() => ({ ...props.clientCategories, ...Object.fromEntries((preview?.messages || []).filter(message => message.category).map(message => [message.clientId, message.category])), ...Object.fromEntries((preview?.clientMatches || []).filter(row => row.category).map(row => [row.clientId, row.category])) }), [preview, props.clientCategories]);
  const reasonGroups = useMemo(() => skipReasonGroups(preview?.skipped || []), [preview]);
  const rows = useMemo(() => {
    const matcher = createSearchMatcher(search);
    const all = tab === "eligible" ? (preview?.messages || []).map(message => ({ key: message.entryId, clientId: message.clientId, companyName: message.companyName, reason: "" }))
      : (preview?.skipped || []).map((client, index) => ({ ...client, key: `skipped:${client.clientId}:${index}` }));
    return all.filter(row => (tab !== "skipped" || !reasonFilter || skipReasonKey(row) === reasonFilter)
      && [row.companyName, row.clientId, preparedCategories[row.clientId]].some(matcher));
  }, [preview, search, tab, reasonFilter, preparedCategories]);
  useEffect(() => { if (!rows.some(row => row.key === selected)) setSelected(rows[0]?.key || ""); }, [rows, selected]);
  const issues = useMemo(() => (preview?.messages || []).reduce((count, message) => count + Number(Boolean(recipientIssue(props.drafts[message.entryId] || initialRecipientDraft(message)))), 0), [preview, props.drafts]);
  const workflow = props.workflows.find(item => item.id === props.workflowId);
  const scenarioCount = workflow?.contentRules?.filter(rule => rule.type === "combination").length || 0;
  const workflowMetadata = workflow?.contentMode === "combinations" ? `Combination${scenarioCount ? ` · ${scenarioCount} scenario${scenarioCount === 1 ? "" : "s"}` : ""}` : undefined;
  const scope = props.selectedCount ? `${props.selectedCount} selected tracker row${props.selectedCount === 1 ? "" : "s"}` : "All tracker clients";
  const reviewing = Boolean(preview);
  const selectedRow = rows.find(row => row.key === selected);
  const selectedMessage = tab === "eligible" ? messageIndex.get(selected) : undefined;
  const selectedMatch = preview?.clientMatches?.find(row => row.clientId === (selectedMessage?.clientId || selectedRow?.clientId));
  const choose = (key: string, detail = true) => { setSelected(key); if (detail) setMobileDetail(true); };
  const changeTab = (next: string) => {
    setTab(next); setMobileDetail(false);
    setSelected(next === "eligible" ? preview?.messages[0]?.entryId || "" : preview?.skipped[0] ? `skipped:${preview.skipped[0].clientId}:0` : "");
  };
  const prepareAction = <PrepareAction busy={preparing} phase={phase} kind={props.kind} refresh={reviewing} disabled={busy || !props.workflowId}
    onClick={event => { keyboardPreparation.current = event.detail === 0; props.onPrepare(); }} />;
  const footer = <div className="email-review-footer tracker-modal-footer">
    <span className={`email-review-footer-status ${issues ? "needs-attention" : ""}`} role="status">{reviewing ? busy && !preparing ? props.deliveryMode === "draft" ? "Starting draft creation…" : "Starting delivery…" : issues ? `${issues} recipient issue${issues === 1 ? "" : "s"}` : `${preview?.messages.length || 0} prepared` : ""}</span>
    <div><GlassButton onClick={props.onClose} disabled={busy} className="email-review-cancel">Cancel</GlassButton>
      {reviewing && <><GlassButton onClick={props.onDrafts} disabled={busy || !preview?.messages.length} className="email-review-drafts">Create Gmail drafts</GlassButton>
        <TransmissionSendButton onClick={props.onSend} suspended={props.interactionLocked} disabled={busy || !preview?.messages.length} count={preview?.messages.length || 0} /></>}
    </div>
  </div>;
  return <TrackerModal open={open} onClose={props.onClose} title="Email clients" subtitle="Review recipients and personalised emails before delivery" icon={Send} inert={props.interactionLocked}
    size="2xl" fixedHeight scrollable={false} className="email-delivery-review-modal" footer={footer}>
    <LayoutGroup id={group}><div className={`email-review-workspace ${reviewing ? "is-reviewing" : "is-preparing"} ${preparing && reviewing ? "is-refreshing" : ""}`}>
      <div className={`email-review-context ${reviewing ? "is-campaign" : ""}`}>
        {!reviewing && <div className="email-review-preparation-heading"><span className="email-review-eyebrow">Delivery workspace</span><h2>Prepare delivery</h2></div>}
        <div className="email-review-context-controls"><div className="email-review-workflow-control"><span className="email-review-control-label">Workflow</span>
          <LiquidGlassDropdown label="Workflow" icon={<Mail size={16} />} value={props.workflowId} description={workflowMetadata} disabled={busy} portal
            options={props.workflows.map(item => ({ value: item.id, label: item.name }))} onChange={props.onWorkflow} /></div>
          <div className="email-review-type-control"><span className="email-review-control-label">Email type</span><SegmentedControl label="Email type" options={[{ value: "initial", label: "Initial email" }, { value: "reminder", label: "Reminder" }]} value={props.kind} onChange={value => props.onKind(value as Props["kind"])} disabled={busy} /></div>
        </div>
        <div className="email-review-scope"><Users size={15} /><div>{!reviewing && <span>Audience scope</span>}<strong>{scope}</strong>{!reviewing && <p>{props.selectedCount ? "Only the selected rows will be evaluated." : "Eligibility rules will determine who is included."}</p>}</div>
          {reviewing && <span className="email-review-campaign-summary">{preview?.messages.length} eligible · {preview?.skipped.length} skipped</span>}
        </div>
        {reviewing && <div className="email-review-refresh-action">{prepareAction}</div>}
      </div>
      {props.error && <div className="email-review-error" role="alert"><CircleAlert size={16} /><div><strong>Unable to prepare email preview.</strong><p>{props.error}</p></div><button type="button" onClick={props.onPrepare} disabled={busy}>Try again <ArrowUpRight size={13} /></button></div>}
        {!reviewing ? <motion.div key="prepare" className="email-review-ready" initial={false} exit={{ opacity: 0, y: reduced ? 0 : -5 }} transition={{ duration: reduced ? 0 : 0.15 }}>
          <div className="email-review-ready-mark" aria-hidden="true"><Mail size={25} /></div>
          <h3>{previousPreview && !preview ? "Preview needs to be refreshed" : props.kind === "reminder" ? "Ready to prepare reminder" : "Ready to prepare"}</h3>
          <p>{props.kind === "reminder" ? "Reply status will be checked before eligible clients are prepared." : "Eligibility, recipients and personalised messages will be checked before delivery."}</p>
          {prepareAction}
        </motion.div> : <motion.div key="review" className={`email-review-panes ${mobileDetail ? "show-detail" : ""}`} initial={{ opacity: reduced ? 1 : .55, y: reduced ? 0 : 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : 0.28, ease }}>
          <aside className="email-review-audience" aria-label="Audience navigator">
            <div className="email-review-audience-controls"><div className="email-review-section-title"><h2 ref={node => {
              if (node && keyboardPreparation.current && !preparing) { keyboardPreparation.current = false; requestAnimationFrame(() => node.focus({ preventScroll: true })); }
            }} tabIndex={-1}>Audience</h2><span>{preview?.messages.length} eligible · {preview?.skipped.length} skipped</span></div>
              <SegmentedControl label="Audience filter" options={[{ value: "eligible", label: `Eligible ${preview?.messages.length}` }, { value: "skipped", label: `Skipped ${preview?.skipped.length}` }]} value={tab} onChange={changeTab} />
              <label className="email-review-search"><Search size={15} /><input aria-label="Search audience clients" placeholder="Search clients…" value={search} onChange={event => setSearch(event.target.value)} />{search && <button type="button" aria-label="Clear audience search" onClick={() => setSearch("")}><X size={13} /></button>}</label>
              {Boolean(preview?.scenarioSummary?.length) && <details className="email-review-reason-breakdown">
                <summary>Scenario matches and eligibility</summary>
                {preview!.scenarioSummary!.map(scenario => <p key={scenario.id}>{scenario.name}: {scenario.matched} matched · {scenario.selected} selected · {scenario.eligible} eligible</p>)}
                <p>{preview?.clientMatches?.filter(row => row.selection.matchedScenarioIds.length > 1).length || 0} overlapping · {preview?.clientMatches?.filter(row => !row.selection.matchedScenarioIds.length).length || 0} with no matching scenario</p>
              </details>}
              {tab === "skipped" && reasonGroups.length > 0 && <details className="email-review-reason-breakdown">
                <summary>Why clients were skipped{reasonFilter ? " · Filter active" : ""}</summary>
                <p>Each client is counted under their first blocking reason.</p>
                <div role="group" aria-label="Skipped reason filter">
                  <button type="button" aria-pressed={!reasonFilter} onClick={() => setReasonFilter("")}>All reasons <span>{preview?.skipped.length}</span></button>
                  {reasonGroups.map(reason => <button key={reason.key} type="button" aria-pressed={reasonFilter === reason.key} onClick={() => setReasonFilter(reason.key)}>{reason.label}<span>{reason.count}</span></button>)}
                </div>
              </details>}
            </div>
            <div className="email-review-client-list" role="list" aria-label={tab === "eligible" ? "Eligible clients" : "Skipped clients"}>
              {rows.map((row, index) => {
                const message = messageIndex.get(row.key), draft = message ? props.drafts[row.key] || initialRecipientDraft(message) : null;
                const issue = draft ? recipientIssue(draft) : null;
                return <div role="listitem" key={row.key}><button type="button" className="email-review-client-row" aria-current={selected === row.key ? "true" : undefined}
                  ref={node => { if (node) audienceRows.current.set(row.key, node); else audienceRows.current.delete(row.key); }}
                  tabIndex={selected === row.key || !rows.some(item => item.key === selected) && index === 0 ? 0 : -1}
                  onClick={() => choose(row.key)} onKeyDown={event => {
                    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
                    event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
                    choose(rows[next].key, false); audienceRows.current.get(rows[next].key)?.focus();
                  }}>
                  {selected === row.key && <motion.span className="email-review-row-selection glass-surface glass-surface--clear" layoutId="audience-selection" transition={{ type: "spring", stiffness: 500, damping: 42, mass: 0.8, duration: reduced ? 0 : undefined }} aria-hidden="true" />}
                  <span className="email-review-row-content"><strong>{row.companyName}</strong><span className="email-review-row-id">{row.clientId}{preparedCategories[row.clientId] ? ` · ${preparedCategories[row.clientId]}` : ""}</span>
                    <span className="email-review-row-bottom">{draft ? <><span>{recipientCount(draft)} recipient{recipientCount(draft) === 1 ? "" : "s"}</span><span className={`email-review-status ${issue ? "needs-attention" : "is-ready"}`}><i />{issue ? "Needs attention" : "Ready"}</span></> : <span className="email-review-skip-reason">{row.reason}</span>}</span>
                  </span>
                </button></div>;
              })}
              {!rows.length && <div className="email-review-list-empty"><Search size={20} /><p>{search ? "No clients match your search." : tab === "eligible" ? "No eligible clients" : "No clients were skipped."}</p></div>}
            </div>
          </aside>
          <section className="email-review-detail" aria-label="Selected client review" aria-busy={preparing}>
            <button type="button" className="email-review-back" onClick={() => { setMobileDetail(false); requestAnimationFrame(() => audienceRows.current.get(selected)?.focus()); }}><ArrowLeft size={15} /> Back to audience</button>
            {preview?.messages.length === 0 && <div className="email-review-no-eligible"><Mail size={19} /><div><strong>No eligible clients</strong><p>No tracker clients currently match this workflow. {preview.skipped.length} client{preview.skipped.length === 1 ? " was" : "s were"} skipped.</p></div><button type="button" onClick={() => { changeTab("skipped"); setMobileDetail(false); }}>Review skipped clients</button></div>}
            <div ref={detailScope} className="email-review-detail-content">
              {selectedMatch && selectedMatch.selection.scenarios.length > 0 && <div className="email-review-reason-breakdown">
                <p>{selectedMatch.category} · Matched: {selectedMatch.selection.scenarios.filter(row => row.matched).map(row => row.name).join(", ") || "None"}</p>
                <p>Selected: {selectedMatch.selection.scenarios.filter(row => row.selected).map(row => row.name).join(", ") || "None"}{selectedMatch.selection.ignoredScenarioIds.length ? ` · Lower priority: ${selectedMatch.selection.scenarios.filter(row => selectedMatch.selection.ignoredScenarioIds.includes(row.id)).map(row => row.name).join(", ")}` : ""}</p>
              </div>}
              {selectedMessage ? <ClientRecipientReview message={selectedMessage} draft={props.drafts[selectedMessage.entryId] || initialRecipientDraft(selectedMessage)} kind={props.kind} disabled={busy}
                signature={props.signature} signatureLoading={props.signatureLoading} signatureGap={preview?.workflow.signatureGap ?? 2} onChange={draft => props.onDraft(selectedMessage.entryId, draft)} onExpand={() => props.onExpand(selectedMessage)} />
                : selectedRow?.reason ? <div className="email-review-skipped-detail"><span className="email-review-eyebrow">Skipped client</span><h2>{selectedRow.companyName}</h2><p className="email-review-skipped-id">{selectedRow.clientId}</p><div><CircleAlert size={21} /><h3>This client was skipped</h3><p>{selectedRow.reason}</p></div></div>
                  : <div className="email-review-detail-empty"><Mail size={28} /><h3>Select a client to review</h3><p>Inspect recipients and the personalised email from the audience list.</p></div>}
            </div>
          </section>
        </motion.div>}
    </div></LayoutGroup>
  </TrackerModal>;
}
