"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent } from "framer-motion";
import { Plus, X } from "lucide-react";
import LiquidGlassDropdown from "@/components/ui/LiquidGlassDropdown";
import type { TrackerCondition, TrackerConditionGroup, TrackerField, TrackerRuleOperator } from "@/lib/clientTrackers";
import { emailConditionFields, emailConditionInputType, emailConditionIssue } from "@/lib/tracker-email-context";
import { changeEmailConditionField } from "@/lib/tracker-email-condition-draft";
import { workflowVisibleBounds } from "./useWorkflowMessageInteractions";

const ease = [0.22, 1, 0.36, 1] as const;

function ConditionEntry({ children, reduced }: { children: ReactNode; reduced: boolean }) {
  const present = useIsPresent();
  return <motion.div className="workflow-rule-entry" inert={!present} aria-hidden={!present}
    initial={{ height: 0, opacity: 0, y: reduced ? 0 : -6, filter: reduced ? "blur(0px)" : "blur(2px)" }}
    animate={{ height: "auto", opacity: 1, y: 0, filter: "blur(0px)", scale: 1 }}
    exit={{ height: 0, opacity: 0, scale: reduced ? 1 : .985, filter: reduced ? "blur(0px)" : "blur(1px)" }}
    transition={{ duration: reduced ? .01 : .26, ease }}>
    {children}
  </motion.div>;
}

function SoftText({ value, reduced }: { value: string; reduced: boolean }) {
  return <AnimatePresence initial={false} mode="wait">
    <motion.span key={value} className="workflow-rule-soft-text"
      initial={{ opacity: 0, filter: reduced ? "blur(0px)" : "blur(1px)" }}
      animate={{ opacity: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, filter: reduced ? "blur(0px)" : "blur(1px)" }}
      transition={{ duration: reduced ? .01 : .09, ease }}>{value}</motion.span>
  </AnimatePresence>;
}

export default function WorkflowSendRuleComposer({ group, fields, onChange, onChangeCurrent, valuesForField, operatorsForField, reduced, heading = "Send this email when", labelPrefix = "", embedded = false }: {
  group: TrackerConditionGroup;
  fields: TrackerField[];
  onChange: (patch: Partial<TrackerConditionGroup>) => void;
  onChangeCurrent?: (update: (current: TrackerConditionGroup) => Partial<TrackerConditionGroup>) => void;
  valuesForField: (field?: TrackerField) => string[];
  operatorsForField: (field?: TrackerField) => { value: TrackerRuleOperator; label: string }[];
  reduced: boolean;
  heading?: string;
  labelPrefix?: string;
  embedded?: boolean;
}) {
  const prefix = useId();
  const conditionFields = emailConditionFields(fields);
  // These keys identify visual rows only. Persisted conditions keep their existing shape.
  const [rowKeys, setRowKeys] = useState(() => group.conditions.map((_, i) => `${prefix}-${i}`));
  const nextKey = useRef(group.conditions.length);
  const addRef = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLElement>(null), added = useRef<string | null>(null);
  const keys = useRef(rowKeys); keys.current = rowKeys;
  const latest = useRef(group); latest.current = group;
  const commit = (change: (current: TrackerConditionGroup) => Partial<TrackerConditionGroup>) => {
    latest.current = { ...latest.current, ...change(latest.current) };
    if (onChangeCurrent) onChangeCurrent(change); else onChange(latest.current);
  };
  useLayoutEffect(() => {
    if (!added.current) return;
    const index = rowKeys.indexOf(added.current), row = root.current?.querySelector<HTMLElement>(`[data-condition-index="${index}"]`);
    if (!row) return;
    added.current = null; row.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const port = root.current?.closest<HTMLElement>(".tracker-email-content-scroll");
    if (port) { const bounds = workflowVisibleBounds(port), rect = row.getBoundingClientRect(); if (rect.bottom > bounds.bottom) port.scrollTop += rect.bottom - bounds.bottom; else if (rect.top < bounds.top) port.scrollTop += rect.top - bounds.top; }
  }, [rowKeys]);
  const update = (index: number, patch: Partial<TrackerCondition> | ((condition: TrackerCondition) => TrackerCondition)) => {
    const target = keys.current.indexOf(rowKeys[index]);
    commit(current => ({ conditions: current.conditions.map((condition, i) => i === target ? typeof patch === "function" ? patch(condition) : { ...condition, ...patch } : condition) }));
  };
  const add = () => {
    if (latest.current.conditions.length >= 12) return;
    const key = `${prefix}-${nextKey.current++}`;
    keys.current = [...keys.current, key]; setRowKeys(keys.current); added.current = key;
    commit(current => current.conditions.length >= 12 ? {} : { conditions: [...current.conditions, { fieldKey: "", operator: "equals", value: "" }] });
  };
  const remove = (index: number) => {
    if (latest.current.conditions.length === 1) return;
    const target = keys.current.indexOf(rowKeys[index]);
    keys.current = keys.current.filter((_, i) => i !== target); setRowKeys(keys.current);
    commit(current => ({ conditions: current.conditions.filter((_, i) => i !== target) }));
    // Keep keyboard focus in the composer when its current row leaves.
    window.requestAnimationFrame(() => addRef.current?.focus({ preventScroll: true }));
  };
  const conditionLabel = (index: number) => `${labelPrefix ? `${labelPrefix} ` : ""}Condition ${index + 1}`;
  return <section ref={root} className={`workflow-send-rule-composer${embedded ? " is-embedded" : ""}`} aria-labelledby={`${prefix}-heading`}>
    <header className="workflow-rule-heading">
      <h4 id={`${prefix}-heading`}>{heading}</h4>
      <div className="workflow-rule-mode" role="group" aria-label="Condition match mode" aria-describedby={`${prefix}-helper`}>
        <motion.span className="workflow-rule-selection" aria-hidden="true" initial={false}
          animate={{ x: group.mode === "ANY" ? "100%" : "0%", scaleX: reduced ? 1 : [1, .97, 1] }}
          transition={{ duration: reduced ? .01 : .25, ease }} />
        {(["ALL", "ANY"] as const).map(mode => <button key={mode} type="button"
          aria-pressed={group.mode === mode} onClick={() => commit(() => ({ mode }))}>
          {mode === "ALL" ? "All" : "Any"}
        </button>)}
      </div>
      <p id={`${prefix}-helper`} className="workflow-rule-helper" aria-live="polite">
        <SoftText value={group.mode === "ALL" ? "Every condition below must match." : "At least one condition below must match."} reduced={reduced} />
      </p>
    </header>
    <div className="workflow-rule-stack">
      <AnimatePresence initial={false}>
        {group.conditions.map((condition, index) => {
          const field = conditionFields.find(item => item.key === condition.fieldKey);
          const needsValue = !["is_empty", "is_not_empty"].includes(condition.operator);
          const values = valuesForField(field);
          const multiple = ["is_any_of", "contains_any", "contains_all"].includes(condition.operator);
          const issue = !condition.fieldKey ? "Choose a field." : emailConditionIssue(condition, conditionFields);
          const operatorIssue = Boolean(field && !operatorsForField(field).some(option => option.value === condition.operator));
          return <ConditionEntry key={rowKeys[index]} reduced={reduced}>
            <motion.div className="workflow-rule-connector-space" aria-hidden="true" initial={false}
              animate={{ height: index > 0 ? "auto" : 0, opacity: index > 0 ? 1 : 0 }}
              transition={{ duration: reduced ? .01 : .26, ease }}>
              <div className="workflow-rule-connector"><SoftText value={group.mode === "ALL" ? "AND" : "OR"} reduced={reduced} /></div>
            </motion.div>
            <div className="workflow-rule-row" data-condition-index={index} role="group" aria-label={conditionLabel(index)}>
              <div className="workflow-rule-control-shell is-field">
                <LiquidGlassDropdown variant="condition" portal label={`${conditionLabel(index)} field`} value={condition.fieldKey}
                  invalid={Boolean(issue && !field)}
                  options={[...(!field ? [{ value: condition.fieldKey, label: condition.fieldKey ? `Unavailable: ${condition.fieldKey}` : "Choose field" }] : []), ...conditionFields.map(item => ({ value: item.key, label: item.label, group: item.group }))]}
                  onChange={fieldKey => { const next = conditionFields.find(item => item.key === fieldKey); if (next) update(index, current => changeEmailConditionField(current, next)); }} />
              </div>
              <div className="workflow-rule-control-shell is-operator">
                <LiquidGlassDropdown variant="condition" portal label={`${conditionLabel(index)} operator`} value={condition.operator}
                  invalid={operatorIssue}
                  disabled={!field} options={operatorsForField(field)}
                  onChange={operator => update(index, { operator: operator as TrackerRuleOperator, value: ["is_any_of", "contains_any", "contains_all"].includes(operator) ? [] : "" })} />
              </div>
              <div className="workflow-rule-control-shell is-value">
                {needsValue ? multiple && values.length ? <LiquidGlassDropdown variant="condition" portal label={`${conditionLabel(index)} values`} value="" invalid={Boolean(issue && field && !operatorIssue)}
                  options={[{ value: "", label: Array.isArray(condition.value) && condition.value.length ? condition.value.join(", ") : "Choose values" }, ...values.filter(value => !Array.isArray(condition.value) || !condition.value.includes(value)).map(value => ({ value, label: value }))]}
                  onChange={value => { if (value) update(index, current => ({ ...current, value: [...(Array.isArray(current.value) ? current.value : []), value] })); }} /> : multiple ? <input className="workflow-rule-control" aria-label={`${conditionLabel(index)} values`} placeholder="Values, separated by commas"
                  aria-invalid={Boolean(issue)} list={values.length ? `${prefix}-values-${index}` : undefined}
                  value={Array.isArray(condition.value) ? condition.value.join(",") : ""}
                  onBlur={() => { if (Array.isArray(condition.value)) update(index, { value: condition.value.map(value => value.trim()) }); }}
                  onChange={event => update(index, { value: event.target.value.split(",") })} /> : values.length ?
                  <LiquidGlassDropdown variant="condition" portal label={`${conditionLabel(index)} value`} value={String(condition.value ?? "")}
                    invalid={Boolean(issue && field && !operatorIssue)}
                    options={[{ value: "", label: "Choose value" }, ...values.map(value => ({ value, label: value }))]}
                    onChange={value => update(index, { value })} />
                 : <input className="workflow-rule-control" aria-label={`${conditionLabel(index)} value`}
                  disabled={!field} aria-invalid={Boolean(issue)} type={emailConditionInputType(field)}
                  value={String(condition.value ?? "")} placeholder="Value"
                  onChange={event => update(index, { value: event.target.value })} />
                  : <span className="workflow-rule-no-value">No value needed</span>}
              </div>
              <button className="workflow-rule-remove" type="button" aria-label={`Remove ${conditionLabel(index).toLowerCase()}`}
                disabled={group.conditions.length === 1} onClick={() => remove(index)}><X aria-hidden="true" /></button>
            </div>
            {multiple && values.length > 0 && Array.isArray(condition.value) && condition.value.length > 0 && <div className="flex flex-wrap gap-1 px-1 pb-1">{condition.value.map(value => <button key={value} type="button" className="workflow-rule-add" aria-label={`Remove ${value} from ${conditionLabel(index).toLowerCase()}`} onClick={() => update(index, current => ({ ...current, value: (Array.isArray(current.value) ? current.value : []).filter(item => item !== value) }))}>{value}<X size={11} /></button>)}</div>}
            {issue && (!field || condition.fieldType || String(condition.value ?? "").trim()) && <p className="workflow-rule-helper" role="status">{issue}</p>}
          </ConditionEntry>;
        })}
      </AnimatePresence>
    </div>
    <div className="workflow-rule-add-wrap"><button ref={addRef} className="workflow-rule-add" type="button"
      disabled={group.conditions.length >= 12} onClick={add}><Plus aria-hidden="true" />Add condition</button></div>
  </section>;
}
