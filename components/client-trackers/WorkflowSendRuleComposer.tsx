"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent } from "framer-motion";
import { Plus, X } from "lucide-react";
import LiquidGlassDropdown from "@/components/ui/LiquidGlassDropdown";
import type { TrackerCondition, TrackerConditionGroup, TrackerField, TrackerRuleOperator } from "@/lib/clientTrackers";

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

export default function WorkflowSendRuleComposer({ group, fields, onChange, valuesForField, operatorsForField, reduced, heading = "Send this email when", labelPrefix = "", embedded = false }: {
  group: TrackerConditionGroup;
  fields: TrackerField[];
  onChange: (patch: Partial<TrackerConditionGroup>) => void;
  valuesForField: (field?: TrackerField) => string[];
  operatorsForField: (field?: TrackerField) => { value: TrackerRuleOperator; label: string }[];
  reduced: boolean;
  heading?: string;
  labelPrefix?: string;
  embedded?: boolean;
}) {
  const prefix = useId();
  // These keys identify visual rows only. Persisted conditions keep their existing shape.
  const [rowKeys, setRowKeys] = useState(() => group.conditions.map((_, i) => `${prefix}-${i}`));
  const nextKey = useRef(group.conditions.length);
  const addRef = useRef<HTMLButtonElement>(null);
  const update = (index: number, condition: TrackerCondition) => {
    const conditions = [...group.conditions];
    conditions[index] = condition;
    onChange({ conditions });
  };
  const add = () => {
    if (group.conditions.length >= 12) return;
    const key = `${prefix}-${nextKey.current++}`;
    setRowKeys(current => [...current, key]);
    onChange({ conditions: [...group.conditions, { fieldKey: fields[0]?.key || "status", operator: "equals", value: "" }] });
  };
  const remove = (index: number) => {
    if (group.conditions.length === 1) return;
    setRowKeys(current => current.filter((_, i) => i !== index));
    onChange({ conditions: group.conditions.filter((_, i) => i !== index) });
    // Keep keyboard focus in the composer when its current row leaves.
    window.requestAnimationFrame(() => addRef.current?.focus({ preventScroll: true }));
  };
  const conditionLabel = (index: number) => `${labelPrefix ? `${labelPrefix} ` : ""}Condition ${index + 1}`;
  return <section className={`workflow-send-rule-composer${embedded ? " is-embedded" : ""}`} aria-labelledby={`${prefix}-heading`}>
    <header className="workflow-rule-heading">
      <h4 id={`${prefix}-heading`}>{heading}</h4>
      <div className="workflow-rule-mode" role="group" aria-label="Condition match mode" aria-describedby={`${prefix}-helper`}>
        <motion.span className="workflow-rule-selection" aria-hidden="true" initial={false}
          animate={{ x: group.mode === "ANY" ? "100%" : "0%" }}
          transition={reduced ? { duration: .01 } : { type: "spring", stiffness: 380, damping: 38, mass: 1 }} />
        {(["ALL", "ANY"] as const).map(mode => <button key={mode} type="button"
          aria-pressed={group.mode === mode} onClick={() => onChange({ mode })}>
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
          const field = fields.find(item => item.key === condition.fieldKey);
          const needsValue = !["is_empty", "is_not_empty"].includes(condition.operator);
          const values = valuesForField(field);
          return <ConditionEntry key={rowKeys[index]} reduced={reduced}>
            <motion.div className="workflow-rule-connector-space" aria-hidden="true" initial={false}
              animate={{ height: index > 0 ? "auto" : 0, opacity: index > 0 ? 1 : 0 }}
              transition={{ duration: reduced ? .01 : .26, ease }}>
              <div className="workflow-rule-connector"><SoftText value={group.mode === "ALL" ? "AND" : "OR"} reduced={reduced} /></div>
            </motion.div>
            <div className="workflow-rule-row" role="group" aria-label={conditionLabel(index)}>
              <div className="workflow-rule-control-shell is-field">
                <LiquidGlassDropdown variant="condition" portal label={`${conditionLabel(index)} field`} value={condition.fieldKey}
                  options={fields.map(item => ({ value: item.key, label: item.label }))}
                  onChange={fieldKey => update(index, { fieldKey, operator: "equals", value: "" })} />
              </div>
              <div className="workflow-rule-control-shell is-operator">
                <LiquidGlassDropdown variant="condition" portal label={`${conditionLabel(index)} operator`} value={condition.operator}
                  options={operatorsForField(field)}
                  onChange={operator => update(index, { ...condition, operator: operator as TrackerRuleOperator })} />
              </div>
              <div className="workflow-rule-control-shell is-value">
                {needsValue ? values.length ?
                  <LiquidGlassDropdown variant="condition" portal label={`${conditionLabel(index)} value`} value={String(condition.value ?? "")}
                    options={[{ value: "", label: "Choose value" }, ...values.map(value => ({ value, label: value }))]}
                    onChange={value => update(index, { ...condition, value })} />
                 : <input className="workflow-rule-control" aria-label={`${conditionLabel(index)} value`}
                  type={field?.type === "number" ? "number" : field?.type === "date" ? "date" : "text"}
                  value={String(condition.value ?? "")} placeholder="Value"
                  onChange={event => update(index, { ...condition, value: event.target.value })} />
                  : <span className="workflow-rule-no-value">No value needed</span>}
              </div>
              <button className="workflow-rule-remove" type="button" aria-label={`Remove ${conditionLabel(index).toLowerCase()}`}
                disabled={group.conditions.length === 1} onClick={() => remove(index)}><X aria-hidden="true" /></button>
            </div>
          </ConditionEntry>;
        })}
      </AnimatePresence>
    </div>
    <div className="workflow-rule-add-wrap"><button ref={addRef} className="workflow-rule-add" type="button"
      disabled={group.conditions.length >= 12} onClick={add}><Plus aria-hidden="true" />Add condition</button></div>
  </section>;
}
