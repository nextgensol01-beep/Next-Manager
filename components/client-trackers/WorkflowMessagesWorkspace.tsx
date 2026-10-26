"use client";

import { memo, useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useIsPresent } from "framer-motion";
import { ArrowDown, ArrowUp, ChevronDown, FileText, Plus, Trash2, X } from "lucide-react";
import WorkflowSendRuleComposer from "./WorkflowSendRuleComposer";
import RichTextEditor, { type EmailEditorVariable } from "./TrackerRichTextEditor";
import LiquidGlassDropdown from "@/components/ui/LiquidGlassDropdown";
import type { TrackerConditionGroup, TrackerEmailContentRule, TrackerEmailWorkflow, TrackerField, TrackerRuleOperator } from "@/lib/clientTrackers";
import { readableEmailPreview } from "@/lib/tracker-editor-document";
import { emailConditionFields } from "@/lib/tracker-email-context";
import { TRACKER_EMAIL_CONTENT_RULE_LIMIT } from "@/lib/clientTrackers";
import type { DraftRuleChange, RemovedDraftRule } from "@/lib/tracker-email-draft-rules";
import { emailScenarioIssues } from "@/lib/tracker-email-validation";
import type { DraftScenarioAnalysis } from "./WorkflowTrackerClientPreview";
import { useWorkflowMessageInteractions } from "./useWorkflowMessageInteractions";
import WorkflowMessageRemoval from "./WorkflowMessageRemoval";

type Mode = NonNullable<TrackerEmailWorkflow["contentMode"]>;
const modes = {
  points: { title: "Points", item: "Point", type: "point", intro: "Add the short points that should appear when matching conditions are met.", content: "Point content", placeholder: "Write the point added when these conditions match…" },
  statements: { title: "Statements", item: "Statement", type: "statement", intro: "Add the statements that should appear when matching conditions are met.", content: "Statement content", placeholder: "Write the statement added when these conditions match…" },
  combinations: { title: "Combination scenarios", item: "Scenario", type: "combination", intro: "Add scenarios that determine which message is used for each matching combination.", content: "Combination message", placeholder: "Write the message used for this combination…" },
} as const;
const ease = [0.22, 1, 0.36, 1] as const;
const RuleMessageEditor = memo(function RuleMessageEditor({ ruleId, label, value, mode, variables, placeholder, onUpdate }: {
  ruleId: string; label: string; value: string; mode: TrackerEmailContentRule["type"]; variables: EmailEditorVariable[]; placeholder: string; onUpdate: Props["onUpdate"];
}) {
  return <RichTextEditor mode={mode} label={label} value={value} variables={variables} placeholder={placeholder} onChange={content => onUpdate(ruleId, { content })} />;
});

function RuleSurface({ children, reduced, open, ruleId, highlighted, onNode, onSettled, onHighlightEnd }: { children: React.ReactNode; reduced: boolean; open: boolean; ruleId: string; highlighted: boolean; onNode: (node: HTMLElement | null) => void; onSettled: () => void; onHighlightEnd: () => void }) {
  const present = useIsPresent();
  return <motion.article ref={onNode} data-rule-id={ruleId} data-draft-highlight={highlighted || undefined} onAnimationComplete={onSettled}
    onAnimationEnd={event => { if (event.target === event.currentTarget && event.animationName === "workflow-message-added") onHighlightEnd(); }}
    layout="position" className={`workflow-message-surface${open ? " is-expanded" : ""}`} inert={!present} aria-hidden={!present}
    initial={{ height: 0, opacity: 0, y: reduced ? 0 : -8, filter: reduced ? "blur(0px)" : "blur(2px)" }}
    animate={{ height: "auto", opacity: 1, y: 0, filter: "blur(0px)" }}
    exit={{ height: 0, opacity: 0, scale: reduced ? 1 : .985 }} transition={{ duration: reduced ? .01 : .32, ease }}>
    {children}
  </motion.article>;
}

function textPreview(html: string) {
  const spaced = html.replace(/<\/?(?:p|div|li|ul|ol|blockquote)\b[^>]*>|<br\s*\/?\s*>/gi, " ");
  if (typeof DOMParser === "undefined") return spaced.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
  return new DOMParser().parseFromString(spaced, "text/html").body.textContent?.replace(/\s+/g, " ").trim() || "";
}

function conditionSummary(group: TrackerConditionGroup, fields: TrackerField[], operatorsForField: Props["operatorsForField"]) {
  fields = emailConditionFields(fields);
  return group.conditions.map(condition => {
    const field = fields.find(item => item.key === condition.fieldKey);
    const operator = operatorsForField(field).find(item => item.value === condition.operator)?.label || condition.operator;
    return `${field?.label || (condition.fieldKey ? "Removed column" : "Choose field")} ${operator}${["is_empty", "is_not_empty"].includes(condition.operator) ? "" : ` ${String(condition.value ?? "…") || "…"}`}`;
  }).join(group.mode === "ANY" ? " · OR · " : " · AND · ");
}

type Props = {
  mode: Mode; rules: TrackerEmailContentRule[]; fields: TrackerField[]; variables: EmailEditorVariable[]; reduced: boolean;
  /** The selection handoff animates the whole workspace; avoid stacking entry motion. */
  resolveFromStyle?: boolean;
  matchingMode?: TrackerEmailWorkflow["combinationMatchingMode"];
  onMatchingMode?: (mode: "first" | "combine") => void;
  allRules?: TrackerEmailContentRule[];
  totalRuleCount?: number;
  onAdd: (type: TrackerEmailContentRule["type"]) => string | null;
  onUpdate: (id: string, patch: DraftRuleChange) => void;
  onTestClients?: (ruleId?: string) => void;
  analysis?: DraftScenarioAnalysis | null;
  analysisCurrent?: boolean;
  validationTarget?: { ruleId: string; conditionIndex?: number; request: number } | null;
  onRemove: (id: string, expected?: TrackerEmailContentRule) => void;
  onRestore?: (snapshot: RemovedDraftRule) => void;
  onMove: (id: string, direction: -1 | 1) => void; onPreview: () => void;
  valuesForField: (field?: TrackerField) => string[];
  operatorsForField: (field?: TrackerField) => { value: TrackerRuleOperator; label: string }[];
};

export default function WorkflowMessagesWorkspace({ mode, rules, allRules, totalRuleCount, fields, variables, reduced, resolveFromStyle = false, matchingMode, onMatchingMode, onAdd, onUpdate, onRemove, onRestore, onMove, onPreview, onTestClients, analysis, analysisCurrent = false, validationTarget, valuesForField, operatorsForField }: Props) {
  const id = useId();
  const config = modes[mode];
  const updateRef = useRef(onUpdate); updateRef.current = onUpdate;
  const commitRule = useCallback<Props["onUpdate"]>((ruleId, patch) => updateRef.current(ruleId, patch), []);
  const messageVariables = useMemo(() => variables.filter(variable => !["{{points}}", "{{statements}}", "{{combinationMessage}}"].includes(variable.token)), [variables]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => Object.fromEntries(rules.map((rule, index) => [rule.id, index === 0])));
  const actions = useWorkflowMessageInteractions({ rules, allRules, totalRuleCount, item: config.item, reduced, onAdd, onRemove, onRestore });
  useLayoutEffect(() => {
    if (!validationTarget) return;
    setExpanded(current => ({ ...current, [validationTarget.ruleId]: true }));
    actions.revealRule(validationTarget.ruleId, validationTarget.conditionIndex);
    // A validation attempt owns focus once; typing must not repeatedly steal it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validationTarget?.request]);
  const isCombination = mode === "combinations";
  const feedback = actions.feedback || actions.undoAvailable ? <div className="workflow-message-feedback" role="status" aria-live="polite">
    <span>{actions.feedback || `${config.item} removed from draft.`}</span>
    {actions.undoAvailable && <button type="button" className="workflow-message-undo" onClick={actions.undo}>Undo</button>}
    {actions.feedback && !actions.undoAvailable && <button type="button" aria-label="Dismiss draft notification" onClick={actions.dismissFeedback}><X size={13} /></button>}
  </div> : null;
  return <section ref={actions.root} className={`workflow-messages-workspace is-${config.type}`} aria-labelledby={`${id}-heading`} onPointerDownCapture={event => actions.cancelReveal(event.target)}>
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{actions.announcement}</span>
    <motion.header className="workflow-messages-intro" initial={resolveFromStyle ? false : { opacity: 0, y: reduced ? 0 : 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? .01 : .3, ease }}>
      <div><h3 id={`${id}-heading`}>{config.title}</h3><p>{config.intro}</p></div>
      <div className="workflow-message-actions">
        {isCombination && <button type="button" className="workflow-message-preview" onClick={onPreview}><FileText size={14} />Preview rule combinations</button>}
        {onTestClients && <button type="button" className="workflow-message-preview" onClick={() => onTestClients()}>Test against tracker clients</button>}
        <button type="button" className="workflow-message-add" disabled={!actions.canAdd} aria-describedby={!actions.canAdd ? `${id}-limit` : undefined} onClick={() => {
          const ruleId = actions.add(config.type); if (!ruleId) return;
          setExpanded(current => ({ ...current, [ruleId]: true }));
        }}><Plus size={15} />Add {config.item.toLowerCase()}</button>
      </div>
    </motion.header>
    {analysis && <p className="workflow-rule-helper" role="status">{analysisCurrent ? `${analysis.result.evaluated} tracker clients evaluated · ${analysis.result.counts.overlapping} overlapping · ${analysis.result.counts.excluded} excluded${analysis.result.complete ? "" : " · Partial analysis"}` : "Tracker-client analysis is outdated. Retest the current draft."}</p>}
    {!actions.canAdd && <p id={`${id}-limit`} className="workflow-message-limit" role="status">The {TRACKER_EMAIL_CONTENT_RULE_LIMIT}-message limit is reached, including messages in other styles. Remove a message to add another.</p>}
    {isCombination && onMatchingMode && <div className="workflow-message-disposition">
      <LiquidGlassDropdown variant="condition" portal label="Overlapping scenarios" value={matchingMode || "legacy"}
        options={[...(!matchingMode ? [{ value: "legacy", label: "Existing behavior · first matching scenario" }] : []), { value: "first", label: "First matching scenario" }, { value: "combine", label: "Combine matching scenarios" }]}
        onChange={value => { if (value === "first" || value === "combine") onMatchingMode(value); }} />
    </div>}
    <motion.div className="workflow-message-stack" initial={resolveFromStyle ? false : { opacity: 0, y: reduced ? 0 : 8, filter: reduced ? "blur(0px)" : "blur(2px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: reduced ? .01 : .34, ease }}>
      <AnimatePresence initial={false} onExitComplete={() => actions.finishLayout()}>
        {rules.map((rule, index) => {
          const open = expanded[rule.id] ?? false;
          const itemLabel = `${config.item} ${index + 1}`;
          const label = `${itemLabel}${rule.name ? ` — ${rule.name}` : ""}`;
          const issues = emailScenarioIssues(rule, fields), coverage = analysisCurrent ? analysis?.result.scenarios.find(item => item.id === rule.id) : undefined;
          const bodyId = `${id}-${rule.id}-body`;
          return <RuleSurface key={rule.id} ruleId={rule.id} reduced={reduced} open={open} highlighted={actions.highlighted === rule.id}
            onNode={node => actions.bindCard(rule.id, node)} onSettled={() => actions.finishLayout(rule.id)} onHighlightEnd={() => actions.setHighlighted(current => current === rule.id ? null : current)}>
            <div className="workflow-message-head">
              <button type="button" className="workflow-message-expander" aria-expanded={open} aria-controls={bodyId}
                onClick={() => setExpanded(current => ({ ...current, [rule.id]: !open }))}>
                <span><strong>{label}</strong><span className="workflow-message-summary">{conditionSummary(rule.conditionGroup, fields, operatorsForField)}</span>
                  {!open && <span className="workflow-message-summary">{rule.action === "skip" ? "Exclude matched clients" : "Send matched clients"}{issues.length ? ` · ${issues[0].status}: ${issues[0].message}` : coverage ? ` · ${coverage.matched} matched${coverage.overlapping ? ` · ${coverage.overlapping} overlapping` : ""}` : " · Valid configuration"}</span>}
                  {!open && <span className="workflow-message-excerpt">{rule.action === "skip" ? "Exclude matching clients" : readableEmailPreview(textPreview(rule.content || ""), variables) || "No content yet"}</span>}
                </span><ChevronDown size={16} className={open ? "is-open" : ""} />
              </button>
              <div className="workflow-message-head-actions">
                {isCombination && <div className="workflow-message-priority" role="group" aria-label={`${itemLabel} priority`}>
                  <span>Priority <b>{index + 1}</b></span>
                  <button type="button" aria-label={`Move ${itemLabel.toLowerCase()} up`} disabled={index === 0} onClick={() => { onMove(rule.id, -1); actions.revealRule(rule.id); }}><ArrowUp size={13} /></button>
                  <button type="button" aria-label={`Move ${itemLabel.toLowerCase()} down`} disabled={index === rules.length - 1} onClick={() => { onMove(rule.id, 1); actions.revealRule(rule.id); }}><ArrowDown size={13} /></button>
                </div>}
                <button type="button" className="workflow-message-remove" aria-label={`Remove ${itemLabel.toLowerCase()}`} onClick={event => actions.requestRemoval(rule, index, event.currentTarget)}><Trash2 size={14} /></button>
              </div>
            </div>
            {actions.pending?.snapshot.rule.id === rule.id && <WorkflowMessageRemoval label={actions.pending.label} item={config.item} trigger={actions.pending.trigger}
              onCancel={actions.cancelRemoval} onDismiss={() => actions.cancelRemoval(false)} onConfirm={actions.confirmRemoval} />}
            {/* Keep the editor mounted while collapsed, retaining document history and selection. */}
            <motion.div id={bodyId} className="workflow-message-body" inert={!open} aria-hidden={!open} initial={false}
              animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0, y: open || reduced ? 0 : -4, filter: open || reduced ? "blur(0px)" : "blur(2px)" }}
              transition={{ duration: reduced ? .01 : .3, ease }}>
              <div className="workflow-message-body-inner">
                <label className="workflow-scenario-name">{config.item} name <span>(optional)</span><input maxLength={100} aria-label={`${itemLabel} name`} placeholder={itemLabel} value={rule.name || ""} onChange={event => onUpdate(rule.id, { name: event.target.value })} /></label>
                {issues.length > 0 && <div className="workflow-scenario-issue" role="status"><strong>{issues.some(issue => issue.status === "Invalid") ? "Invalid" : "Incomplete"} — {label} needs attention</strong><p>{issues[0].message}</p></div>}
                {!issues.length && coverage && <button type="button" className="workflow-message-preview" onClick={() => onTestClients?.(rule.id)}>{coverage.matched ? `${coverage.matched} clients matched${coverage.overlapping ? ` · ${coverage.overlapping} overlapping` : ""}` : "Valid — No current matches"}{!analysis?.result.complete ? " · Partial audience" : ""}</button>}
                {isCombination && <div className="workflow-message-disposition"><LiquidGlassDropdown variant="condition" portal label={`${itemLabel} matched clients`}
                  value={rule.action || "include"} options={[{ value: "include", label: "Send matched clients" }, { value: "skip", label: "Exclude matched clients" }]}
                  onChange={action => onUpdate(rule.id, { action: action as "include" | "skip" })} /></div>}
                <WorkflowSendRuleComposer embedded heading="Matching conditions" labelPrefix={itemLabel} group={rule.conditionGroup} fields={fields}
                  onChange={patch => onUpdate(rule.id, { conditionGroup: { ...rule.conditionGroup, ...patch } })}
                  onChangeCurrent={change => onUpdate(rule.id, current => ({ conditionGroup: { ...current.conditionGroup, ...change(current.conditionGroup) } }))}
                  valuesForField={valuesForField} operatorsForField={operatorsForField} reduced={reduced} />
                {rule.action !== "skip" ? <div className="workflow-message-writing">
                  <h4>{config.content}</h4>
                  <RuleMessageEditor ruleId={rule.id} mode={config.type} label={`${itemLabel} content`} value={rule.content || ""} variables={messageVariables}
                    placeholder={config.placeholder} onUpdate={commitRule} />
                </div> : <p className="workflow-message-skip-note">Matching clients are excluded. Your message is retained if you switch back to sending.</p>}
              </div>
            </motion.div>
          </RuleSurface>;
        })}
      </AnimatePresence>
      {!rules.length && <div className="workflow-message-empty"><FileText size={22} /><h4>No {isCombination ? "scenarios" : config.title.toLowerCase()} yet</h4>
        <p>Add a {config.item.toLowerCase()} to connect a matching condition with your message.</p></div>}
    </motion.div>
    {actions.host ? createPortal(feedback, actions.host) : feedback}
  </section>;
}
