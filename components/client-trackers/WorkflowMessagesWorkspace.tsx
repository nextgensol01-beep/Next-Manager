"use client";

import { useId, useRef, useState } from "react";
import { AnimatePresence, motion, useIsPresent } from "framer-motion";
import { ArrowDown, ArrowUp, ChevronDown, FileText, Plus, Trash2 } from "lucide-react";
import WorkflowSendRuleComposer from "./WorkflowSendRuleComposer";
import RichTextEditor, { type EmailEditorVariable } from "./TrackerRichTextEditor";
import LiquidGlassDropdown from "@/components/ui/LiquidGlassDropdown";
import type { TrackerConditionGroup, TrackerEmailContentRule, TrackerEmailWorkflow, TrackerField, TrackerRuleOperator } from "@/lib/clientTrackers";

type Mode = NonNullable<TrackerEmailWorkflow["contentMode"]>;
const modes = {
  points: { title: "Points", item: "Point", type: "point", intro: "Add the short points that should appear when matching conditions are met.", content: "Point content", placeholder: "Write the short point to include when these conditions match." },
  statements: { title: "Statements", item: "Statement", type: "statement", intro: "Add the statements that should appear when matching conditions are met.", content: "Statement content", placeholder: "Write the statement to include when these conditions match." },
  combinations: { title: "Combination scenarios", item: "Scenario", type: "combination", intro: "Add scenarios that determine which message is used for each matching combination.", content: "Combination message", placeholder: "Write the message to use for this matching combination." },
} as const;
const ease = [0.22, 1, 0.36, 1] as const;

function RuleSurface({ children, reduced }: { children: React.ReactNode; reduced: boolean }) {
  const present = useIsPresent();
  return <motion.article layout="position" className="workflow-message-surface" inert={!present} aria-hidden={!present}
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
  return group.conditions.map(condition => {
    const field = fields.find(item => item.key === condition.fieldKey);
    const operator = operatorsForField(field).find(item => item.value === condition.operator)?.label || condition.operator;
    return `${field?.label || "Removed column"} ${operator}${["is_empty", "is_not_empty"].includes(condition.operator) ? "" : ` ${String(condition.value ?? "…") || "…"}`}`;
  }).join(group.mode === "ANY" ? " · OR · " : " · AND · ");
}

type Props = {
  mode: Mode; rules: TrackerEmailContentRule[]; fields: TrackerField[]; variables: EmailEditorVariable[]; reduced: boolean;
  onAdd: (type: TrackerEmailContentRule["type"]) => string;
  onUpdate: (id: string, patch: Partial<TrackerEmailContentRule>) => void;
  onRemove: (id: string) => void; onMove: (id: string, direction: -1 | 1) => void; onPreview: () => void;
  valuesForField: (field?: TrackerField) => string[];
  operatorsForField: (field?: TrackerField) => { value: TrackerRuleOperator; label: string }[];
};

export default function WorkflowMessagesWorkspace({ mode, rules, fields, variables, reduced, onAdd, onUpdate, onRemove, onMove, onPreview, valuesForField, operatorsForField }: Props) {
  const id = useId();
  const config = modes[mode];
  const addRef = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => Object.fromEntries(rules.map((rule, index) => [rule.id, index === 0])));
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const isCombination = mode === "combinations";
  return <section className={`workflow-messages-workspace is-${config.type}`} aria-labelledby={`${id}-heading`}>
    <motion.header className="workflow-messages-intro" initial={{ opacity: 0, y: reduced ? 0 : 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? .01 : .3, ease }}>
      <div><h3 id={`${id}-heading`}>{config.title}</h3><p>{config.intro}</p></div>
      <div className="workflow-message-actions">
        {isCombination && <button type="button" className="workflow-message-preview" onClick={onPreview}><FileText size={14} />Preview rule combinations</button>}
        <button ref={addRef} type="button" className="workflow-message-add" onClick={() => {
          const ruleId = onAdd(config.type);
          setExpanded(current => ({ ...current, [ruleId]: true }));
        }}><Plus size={15} />Add {config.item.toLowerCase()}</button>
      </div>
    </motion.header>
    <motion.div className="workflow-message-stack" initial={{ opacity: 0, y: reduced ? 0 : 8, filter: reduced ? "blur(0px)" : "blur(2px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: reduced ? .01 : .34, ease }}>
      <AnimatePresence initial={false}>
        {rules.map((rule, index) => {
          const open = expanded[rule.id] ?? false;
          const itemLabel = `${config.item} ${index + 1}`;
          const bodyId = `${id}-${rule.id}-body`;
          return <RuleSurface key={rule.id} reduced={reduced}>
            <div className="workflow-message-head">
              <button type="button" className="workflow-message-expander" aria-expanded={open} aria-controls={bodyId}
                onClick={() => setExpanded(current => ({ ...current, [rule.id]: !open }))}>
                <span><strong>{itemLabel}</strong><span className="workflow-message-summary">{conditionSummary(rule.conditionGroup, fields, operatorsForField)}</span>
                  {!open && <span className="workflow-message-excerpt">{rule.action === "skip" ? "Exclude matching clients" : textPreview(rule.content || "") || "No content yet"}</span>}
                </span><ChevronDown size={16} className={open ? "is-open" : ""} />
              </button>
              <div className="workflow-message-head-actions">
                {isCombination && <div className="workflow-message-priority" role="group" aria-label={`${itemLabel} priority`}>
                  <span>Priority <b>{index + 1}</b></span>
                  <button type="button" aria-label={`Move ${itemLabel.toLowerCase()} up`} disabled={index === 0} onClick={() => onMove(rule.id, -1)}><ArrowUp size={13} /></button>
                  <button type="button" aria-label={`Move ${itemLabel.toLowerCase()} down`} disabled={index === rules.length - 1} onClick={() => onMove(rule.id, 1)}><ArrowDown size={13} /></button>
                </div>}
                <button type="button" className="workflow-message-remove" aria-label={`Remove ${itemLabel.toLowerCase()}`} onClick={() => setPendingRemoval(rule.id)}><Trash2 size={14} /></button>
              </div>
            </div>
            {pendingRemoval === rule.id && <div className="workflow-message-confirm" role="alert">
              <span>Remove this {config.item.toLowerCase()}?</span>
              <button type="button" onClick={() => setPendingRemoval(null)}>Keep {config.item.toLowerCase()}</button>
              <button type="button" className="is-destructive" onClick={() => {
                onRemove(rule.id); setPendingRemoval(null);
                window.requestAnimationFrame(() => addRef.current?.focus({ preventScroll: true }));
              }}>Remove {config.item.toLowerCase()}</button>
            </div>}
            {/* Keep the editor DOM mounted while collapsed, retaining native history and selection. */}
            <motion.div id={bodyId} className="workflow-message-body" inert={!open} aria-hidden={!open} initial={false}
              animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0, y: open || reduced ? 0 : -4, filter: open || reduced ? "blur(0px)" : "blur(2px)" }}
              transition={{ duration: reduced ? .01 : .3, ease }}>
              <div className="workflow-message-body-inner">
                {isCombination && <div className="workflow-message-disposition"><LiquidGlassDropdown variant="condition" portal label={`${itemLabel} matched clients`}
                  value={rule.action || "include"} options={[{ value: "include", label: "Send matched clients" }, { value: "skip", label: "Exclude matched clients" }]}
                  onChange={action => onUpdate(rule.id, { action: action as "include" | "skip" })} /></div>}
                <WorkflowSendRuleComposer embedded heading="Matching conditions" labelPrefix={itemLabel} group={rule.conditionGroup} fields={fields}
                  onChange={patch => onUpdate(rule.id, { conditionGroup: { ...rule.conditionGroup, ...patch } })}
                  valuesForField={valuesForField} operatorsForField={operatorsForField} reduced={reduced} />
                {rule.action !== "skip" ? <div className="workflow-message-writing">
                  <h4>{config.content}</h4>
                  <RichTextEditor mode={config.type} label={`${itemLabel} content`} value={rule.content || ""} variables={variables}
                    placeholder={config.placeholder} onChange={content => onUpdate(rule.id, { content })} />
                </div> : <p className="workflow-message-skip-note">Matching clients are excluded. Your message is retained if you switch back to sending.</p>}
              </div>
            </motion.div>
          </RuleSurface>;
        })}
      </AnimatePresence>
      {!rules.length && <div className="workflow-message-empty"><FileText size={22} /><h4>No {isCombination ? "scenarios" : config.title.toLowerCase()} yet</h4>
        <p>Add a {config.item.toLowerCase()} to connect a matching condition with your message.</p></div>}
    </motion.div>
  </section>;
}
