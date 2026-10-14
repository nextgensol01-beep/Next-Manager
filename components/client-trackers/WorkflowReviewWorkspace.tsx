"use client";

import { useId, useMemo, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, CircleAlert, Users, MessageSquareText, Mail, Send, ArrowUpRight, Layers3, type LucideIcon } from "lucide-react";
import type { TrackerEmailWorkflow, TrackerField } from "@/lib/clientTrackers";
import type { EmailEditorVariable } from "@/lib/tracker-editor-document";
import type { EmailWorkflowIssue, WorkflowReviewSection } from "@/lib/tracker-email-validation";
import { buildEmailCombinationPreviews } from "@/lib/tracker-email-combinations";
import { compactEmailPreview } from "@/lib/tracker-email-review";

type Style = NonNullable<TrackerEmailWorkflow["contentMode"]>;
const styleNames = { points: "Points", statements: "Statements", combinations: "Combination style" };
const recipients = { selected: "Client-profile selected email", primary: "Primary linked contact", all: "All linked contacts", per_client: "Review each client before delivery" };
const ease = [.22, 1, .36, 1] as const;

function PreviewText({ value, variables, body = false }: { value: string; variables: EmailEditorVariable[]; body?: boolean }) {
  const parts = useMemo(() => compactEmailPreview(value, variables, body), [value, variables, body]);
  return <span className={body ? "workflow-review-body-preview" : "workflow-review-subject-preview"}>
    {parts.length ? parts.map((part, index) => part.token
      ? <span key={index} className="tracker-preview-variable" aria-label={`${part.text} variable`}>{part.text}</span> : part.text)
      : <span className="workflow-review-empty">{body ? "Email body is missing" : "Email subject is missing"}</span>}
  </span>;
}

function ReviewSection({ title, section, icon: Icon, issues, step, index, reduced, onEdit, children, style }: {
  title: string; section: WorkflowReviewSection; icon: LucideIcon; issues: EmailWorkflowIssue[]; step: number; index: number;
  reduced: boolean; onEdit: (step: number) => void; children: ReactNode; style?: Style;
}) {
  const id = useId();
  return <motion.section className="workflow-review-section" data-review-section={section} aria-labelledby={`${id}-title`}
    initial={{ opacity: 0, y: reduced ? 0 : 7, filter: reduced ? "blur(0px)" : "blur(2px)" }}
    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: reduced ? .1 : .28, delay: reduced ? 0 : .025 * index, ease }}>
    <Icon size={18} className="workflow-review-icon" aria-hidden="true" />
    <div className="workflow-review-main"><h4 id={`${id}-title`}>{title}</h4>{children}
      {!!issues.length && <ul className="workflow-review-issues">{issues.map((issue, issueIndex) => <li key={issueIndex}>
        <CircleAlert size={13} aria-hidden="true" /><span>{issue.message}
          {issue.style && issue.style !== style && <button type="button" onClick={() => onEdit(2)} className="workflow-review-inline-action">Edit the {styleNames[issue.style].toLowerCase()} draft<ArrowUpRight size={12} /></button>}
        </span></li>)}</ul>}
    </div>
    <div className="workflow-review-actions"><span className={`workflow-review-status${issues.length ? " is-attention" : ""}`}>
      {issues.length ? <CircleAlert size={12} aria-hidden="true" /> : <Check size={12} aria-hidden="true" />}{issues.length ? "Needs attention" : "Ready"}
    </span><button type="button" className="workflow-review-edit" aria-label={`Edit ${title}`} onClick={() => onEdit(step)}>Edit<ArrowUpRight size={13} aria-hidden="true" /></button></div>
  </motion.section>;
}

export default function WorkflowReviewWorkspace({ workflow, fields, variables, mode, issues, otherWorkflows = [], onEdit, onPreview, onBack }: {
  workflow: TrackerEmailWorkflow; fields: TrackerField[]; variables: EmailEditorVariable[]; mode: Style; issues: EmailWorkflowIssue[];
  otherWorkflows?: { name: string; issues: number }[]; onEdit: (step: number) => void; onPreview: () => void; onBack: () => void;
}) {
  const reduced = Boolean(useReducedMotion()), id = useId();
  const coverage = useMemo(() => mode === "combinations" ? buildEmailCombinationPreviews(workflow, fields) : null, [workflow, fields, mode]);
  const forSection = (section: WorkflowReviewSection) => issues.filter(issue => issue.section === section);
  const attention = issues.length + otherWorkflows.reduce((count, item) => count + item.issues, 0);
  const type = mode === "combinations" ? "combination" : mode === "statements" ? "statement" : "point";
  const rules = (workflow.contentRules || []).filter(rule => rule.type === type);
  const legacyCount = mode === "combinations" ? 0 : workflow.points.filter(point => (point.format === "statement" ? "statement" : "point") === type).length;
  const ruleCount = rules.length + legacyCount;
  const ruleName = mode === "combinations" ? "scenario" : mode === "statements" ? "statement rule" : "point rule";
  const recipient = recipients[workflow.recipientStrategy || "selected"];
  const conditionGroup = workflow.conditionGroup || { mode: "ALL", conditions: [{ fieldKey: workflow.mainFieldKey }] };
  const attachmentCount = (workflow.attachments || []).length, gap = workflow.signatureGap ?? 2;
  const completeSections = (["audience", "messages", "template", "delivery"] as const).filter(section => !forSection(section).length).length;
  const matched = coverage?.previews.filter(preview => preview.eligible).length || 0;
  const noScenario = rules.length ? coverage?.previews.filter(preview => preview.sendRuleMatched && !preview.scenarioId).length || 0 : 0;
  const excluded = coverage?.previews.filter(preview => !preview.sendRuleMatched).length || 0;
  const skipped = coverage?.previews.filter(preview => preview.sendRuleMatched && preview.scenarioId && !preview.eligible).length || 0;

  return <div className="workflow-review-workspace" data-review-ready={attention === 0}>
    <motion.div className="workflow-review-readiness" role="status" aria-live="polite" aria-atomic="true"
      initial={{ opacity: 0, y: reduced ? 0 : 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? .1 : .25, ease }}>
      <div className={`workflow-review-readiness-title${attention ? " is-attention" : ""}`}>
        {attention ? <CircleAlert size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
        <h3>{attention ? `${attention} ${attention === 1 ? "item needs" : "items need"} attention` : "Ready to save"}</h3>
      </div>
      <p>{attention ? issues.length ? "Complete the highlighted sections before saving." : "This workflow is configured. Check the other workflows before saving." : "Your workflow is configured and ready for review."}</p>
      <span className="workflow-review-metadata">{completeSections} sections complete{mode === "combinations" && ` · ${ruleCount} ${ruleName}${ruleCount === 1 ? "" : "s"}`}{attachmentCount > 0 && ` · ${attachmentCount} ${attachmentCount === 1 ? "attachment" : "attachments"}`}</span>
    </motion.div>
    {forSection("about").map((issue, index) => <div className="workflow-review-details-issue" key={index}><span>{issue.message}</span><button type="button" className="workflow-review-inline-action" onClick={() => onEdit(0)}>Edit workflow details<ArrowUpRight size={12} /></button></div>)}
    {otherWorkflows.length > 0 && <div className="workflow-review-details-issue"><span>{otherWorkflows.length === 1 ? `“${otherWorkflows[0].name}” also needs attention.` : `${otherWorkflows.length} other workflows also need attention.`}</span><button type="button" className="workflow-review-inline-action" onClick={onBack}>Review other workflows<ArrowUpRight size={12} /></button></div>}
    <div className="workflow-review-sections">
      <ReviewSection title="Audience" section="audience" icon={Users} issues={forSection("audience")} step={1} index={0} reduced={reduced} onEdit={onEdit}>
        <p className="workflow-review-summary">{conditionGroup.conditions.length} eligibility condition{conditionGroup.conditions.length === 1 ? "" : "s"}{conditionGroup.conditions.length > 1 && ` · ${conditionGroup.mode === "ANY" ? "Any condition" : "All conditions"}`} · {recipient}</p>
        <button type="button" className="workflow-review-inline-action" onClick={() => onEdit(5)}>Edit recipients<ArrowUpRight size={12} aria-hidden="true" /></button>
      </ReviewSection>
      <ReviewSection title="Messages" section="messages" icon={MessageSquareText} issues={forSection("messages")} step={3} index={1} reduced={reduced} onEdit={onEdit} style={mode}>
        <p className="workflow-review-summary">{styleNames[mode]} · {ruleCount} {ruleName}{ruleCount === 1 ? "" : "s"}{!ruleCount && " · Uses the shared template"}</p>
        {coverage && <div className="workflow-review-coverage" aria-labelledby={`${id}-coverage`}>
          <div className="workflow-review-coverage-heading"><span id={`${id}-coverage`}>Coverage</span><strong>{matched} / {coverage.previews.length}{coverage.limited ? " shown" : ""}</strong></div>
          <div className="workflow-review-coverage-track" role="meter" aria-label={coverage.limited ? "Coverage of shown combinations" : "Combination coverage"} aria-valuemin={0} aria-valuemax={coverage.previews.length} aria-valuenow={matched}><span style={{ width: `${coverage.previews.length ? matched / coverage.previews.length * 100 : 0}%` }} /></div>
          <p className={noScenario ? "is-attention" : ""}>{matched === coverage.previews.length ? <><Check size={12} aria-hidden="true" />All {coverage.limited ? "shown " : ""}combinations covered</> : <>{noScenario > 0 && `${noScenario} ${coverage.limited ? "shown " : ""}combination${noScenario === 1 ? " has" : "s have"} no matching scenario`}{excluded > 0 && `${noScenario ? " · " : ""}${excluded} outside the send rule`}{skipped > 0 && `${noScenario || excluded ? " · " : ""}${skipped} skipped by a scenario`}</>}</p>
          <span className="workflow-review-coverage-note">{coverage.limited ? `First ${coverage.previews.length} of ${coverage.possibleCount} possible combinations. Coverage refers to those shown.` : "Synthetic combinations · coverage does not block saving."}</span>
        </div>}
        {mode === "combinations" && <button type="button" className="workflow-review-preview" onClick={onPreview}><Layers3 size={14} aria-hidden="true" />Preview rule combinations</button>}
      </ReviewSection>
      <ReviewSection title="Template" section="template" icon={Mail} issues={forSection("template")} step={4} index={2} reduced={reduced} onEdit={onEdit}>
        <dl className="workflow-review-template"><div><dt>Subject</dt><dd><PreviewText value={workflow.subject} variables={variables} /></dd></div><div><dt>Body</dt><dd><PreviewText value={workflow.body} variables={variables} body /></dd></div></dl>
      </ReviewSection>
      <ReviewSection title="Delivery" section="delivery" icon={Send} issues={forSection("delivery")} step={5} index={3} reduced={reduced} onEdit={onEdit}>
        <dl className="workflow-review-delivery">
          <div><dt>Send to</dt><dd>{recipient}</dd></div><div><dt>Signature</dt><dd>{gap === 0 ? "No blank line" : `${gap} blank ${gap === 1 ? "line" : "lines"}`}</dd></div>
          <div><dt>Reminder</dt><dd>{workflow.reminderSubject || workflow.reminderBody ? "Prepared · Manual" : "Not prepared · Uses initial email"}</dd></div>
          <div><dt>Follow-up</dt><dd>{workflow.followUp?.enabled ? `Task after ${workflow.followUp.daysAfter} ${workflow.followUp.daysAfter === 1 ? "day" : "days"} if no reply` : "Off"}</dd></div>
          <div><dt>Attachments</dt><dd>{attachmentCount ? `${attachmentCount} ${attachmentCount === 1 ? "file" : "files"}` : "None"}</dd></div>
        </dl>
      </ReviewSection>
    </div>
    <p className="workflow-review-save-note">Save these settings, then use Email clients to review eligible clients and recipients before delivery.</p>
  </div>;
}
