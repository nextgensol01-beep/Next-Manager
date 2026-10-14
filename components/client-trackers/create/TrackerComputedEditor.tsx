"use client";

import { Plus, Sigma, X } from "lucide-react";
import LiquidGlassDropdown from "@/components/ui/LiquidGlassDropdown";
import type { TrackerComputed, TrackerComputedKind, TrackerConditionGroup, TrackerField, TrackerFieldType, TrackerRuleOperator } from "@/lib/clientTrackers";
import { computedSourceFields } from "@/lib/tracker-create";
import { normalizeTrackerOptionColors, trackerOptionColor } from "@/lib/tracker-option-colors";

export const COMPUTED_LABELS = { percentage: "Coverage percentage", difference: "Upload difference", progress: "Progress", combinedStatus: "Combined status" };
const operators: Array<{ value: TrackerRuleOperator; label: string }> = [
  { value: "equals", label: "equals" }, { value: "not_equals", label: "does not equal" },
  { value: "is_empty", label: "is empty" }, { value: "is_not_empty", label: "is not empty" },
  { value: "contains", label: "contains" }, { value: "not_contains", label: "does not contain" },
  { value: "greater_than", label: "greater than" }, { value: "greater_than_or_equal", label: "at least" },
  { value: "less_than", label: "less than" }, { value: "less_than_or_equal", label: "at most" },
];
export default function TrackerComputedEditor({ field, fields, advanced, onPatch }: {
  field: TrackerField; fields: TrackerField[]; advanced: boolean; onPatch: (patch: Partial<TrackerField>) => void;
}) {
  const computed = field.computed!;
  const sourceFields = computedSourceFields(fields, field);
  const defaultGroup: TrackerConditionGroup = { mode: "ALL", conditions: [{ fieldKey: sourceFields[0]?.key || "", operator: "equals", value: "" }] };
  const group = computed.conditionGroup || defaultGroup;
  const patchComputed = (value: TrackerComputed) => {
    const options = value.kind === "combinedStatus" ? [value.matchedLabel || "Ready", value.fallbackLabel || "Pending"] : undefined;
    const previousLabels = [computed.matchedLabel || "Ready", computed.fallbackLabel || "Pending"];
    onPatch({ computed: value,
      type: (value.kind === "percentage" || value.kind === "difference" ? "number" : value.kind === "combinedStatus" ? "select" : "text") as TrackerFieldType,
      options, optionInput: undefined,
      optionColors: options ? normalizeTrackerOptionColors(options, computed.kind === "combinedStatus"
        ? Object.fromEntries(options.map((option, index) => [option, trackerOptionColor(field, previousLabels[index])])) : {}) : undefined });
  };
  const updateGroup = (patch: Partial<TrackerConditionGroup>) => patchComputed({ ...computed, kind: "combinedStatus", conditionGroup: { ...group, ...patch } });
  const sourceOptions = [{ value: "", label: "Choose a column" }, ...sourceFields.map(source => ({ value: source.key, label: source.label }))];
  const primaryLabel = computed.kind === "difference" ? "Expected quantity" : computed.kind === "progress" ? "Completed" : advanced ? "Covered" : "Covered / uploaded field";
  const secondaryLabel = computed.kind === "difference" ? "Uploaded quantity" : computed.kind === "progress" ? "Total steps" : advanced ? "Required" : "Required / received field";
  return <div className="create-computed-editor">
    {advanced ? <div className="create-field"><span className="create-label"><Sigma size={14} className="create-computed-mark" />Calculation</span>
      <LiquidGlassDropdown label="Calculation" variant="condition" portal value={computed.kind}
        options={Object.entries(COMPUTED_LABELS).map(([value, label]) => ({ value, label }))} onChange={value => {
          const kind = value as TrackerComputedKind;
          patchComputed(kind === "combinedStatus" ? { kind, conditionGroup: defaultGroup, matchedLabel: "Ready", fallbackLabel: "Pending" }
            : { kind, primaryFieldKey: sourceFields[0]?.key || "", secondaryFieldKey: sourceFields[1]?.key || sourceFields[0]?.key || "" });
        }} />
    </div> : <div className="create-computed-heading"><Sigma size={14} className="create-computed-mark" /><span>{COMPUTED_LABELS[computed.kind]}</span></div>}
    {computed.kind !== "combinedStatus" ? <div className="create-editor-grid">
      <div className="create-field"><span className="create-label">{primaryLabel}</span><LiquidGlassDropdown label={primaryLabel} variant="condition" portal
        value={computed.primaryFieldKey || ""} options={sourceOptions} onChange={value => advanced ? patchComputed({ ...computed, primaryFieldKey: value }) : onPatch({ computed: { ...computed, primaryFieldKey: value } })} /></div>
      <div className="create-field"><span className="create-label">{secondaryLabel}</span><LiquidGlassDropdown label={secondaryLabel} variant="condition" portal
        value={computed.secondaryFieldKey || ""} options={sourceOptions} onChange={value => advanced ? patchComputed({ ...computed, secondaryFieldKey: value }) : onPatch({ computed: { ...computed, secondaryFieldKey: value } })} /></div>
    </div> : <>
      <p className="create-help">Return the matched label when these conditions are true.</p>
      <LiquidGlassDropdown label="Condition matching" variant="condition" portal value={group.mode} options={[{ value: "ALL", label: "ALL conditions" }, { value: "ANY", label: "ANY condition" }]}
        onChange={value => updateGroup({ mode: value as "ALL" | "ANY" })} />
      <div className="configure-conditions">{group.conditions.map((condition, index) => {
        const source = sourceFields.find(item => item.key === condition.fieldKey);
        const values = source?.type === "toggle" ? ["Yes", "No"] : source?.options || [];
        const needsValue = !["is_empty", "is_not_empty"].includes(condition.operator);
        const update = (patch: Partial<typeof condition>) => updateGroup({ conditions: group.conditions.map((item, i) => i === index ? { ...item, ...patch } : item) });
        return <div key={index} className="configure-condition">
          <LiquidGlassDropdown label={`Condition ${index + 1} column`} variant="condition" portal value={condition.fieldKey} options={sourceOptions}
            onChange={value => update({ fieldKey: value, operator: "equals", value: "" })} />
          <LiquidGlassDropdown label={`Condition ${index + 1} comparison`} variant="condition" portal value={condition.operator} options={operators}
            onChange={value => update({ operator: value as TrackerRuleOperator })} />
          {needsValue ? values.length ? <LiquidGlassDropdown label={`Condition ${index + 1} value`} variant="condition" portal value={String(condition.value ?? "")}
            options={[{ value: "", label: "Choose value" }, ...values.map(value => ({ value, label: value }))]} onChange={value => update({ value })} />
            : <input aria-label={`Condition ${index + 1} value`} type={source?.type === "number" ? "number" : source?.type === "date" ? "date" : "text"}
              value={String(condition.value ?? "")} placeholder="Value" onChange={event => update({ value: event.target.value })} />
            : <span className="create-help">No value needed</span>}
          <button type="button" className="create-icon-button" aria-label={`Remove condition ${index + 1}`} disabled={group.conditions.length === 1}
            onClick={() => updateGroup({ conditions: group.conditions.filter((_, i) => i !== index) })}><X size={14} /></button>
        </div>;
      })}</div>
      <button type="button" className="create-text-action" disabled={group.conditions.length >= 12 || !sourceFields.length}
        onClick={() => updateGroup({ conditions: [...group.conditions, { fieldKey: sourceFields[0]?.key || "", operator: "equals", value: "" }] })}><Plus size={13} />Add condition</button>
      <div className="create-editor-grid">
        <label className="create-field"><span className="create-label">Matched label</span><input aria-label="Matched label" value={computed.matchedLabel || "Ready"}
          onChange={event => patchComputed({ ...computed, matchedLabel: event.target.value })} /></label>
        <label className="create-field"><span className="create-label">Fallback label</span><input aria-label="Fallback label" value={computed.fallbackLabel || "Pending"}
          onChange={event => patchComputed({ ...computed, fallbackLabel: event.target.value })} /></label>
      </div>
    </>}
    {!advanced && <p className="create-help">After creation, Configure lets you switch this to upload difference, progress, or combined status.</p>}
  </div>;
}
