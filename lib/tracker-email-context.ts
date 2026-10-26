import { CLIENT_TRACKER_CATEGORIES, type TrackerCondition, type TrackerConditionGroup, type TrackerEmailWorkflow, type TrackerField, type TrackerFieldType, type TrackerRuleOperator, type TrackerValue, type TrackerValues } from "./clientTrackers";
import { STATES } from "./utils";
import { evaluateTrackerCondition, parseTrackerDate as emailDate, parseTrackerNumber as number } from "./server/tracker-conditions";
export { emailDate };

export const EMAIL_COMMUNICATION_STATUSES = ["Not Contacted", "Draft Created", "Sent", "Reminder Sent", "Replied", "Failed"];
export type EmailConditionField = TrackerField & { group: "Client information" | "Tracker columns" };
export const emailValueText = (value: TrackerValue | undefined) => Array.isArray(value) ? value.join(", ") : value === true ? "Yes" : value === false ? "No" : String(value ?? "");
const numericTypes = new Set(["number", "percentage", "quantity", "currency", "progress"]);
const family = (type: TrackerFieldType) => numericTypes.has(type) ? "number" : ["text", "longText"].includes(type) ? "text" : ["tags", "multiSelect"].includes(type) ? "multi" : ["status", "select"].includes(type) ? "choice" : type;
const fieldRegistries = new WeakMap<TrackerField[], EmailConditionField[]>();
export function emailConditionFields(fields: TrackerField[]): EmailConditionField[] {
  const cached = fieldRegistries.get(fields); if (cached) return cached;
  const registry: EmailConditionField[] = [
    { key: "client.category", label: "Client Category", type: "select", options: [...CLIENT_TRACKER_CATEGORIES], group: "Client information" },
    { key: "client.state", label: "State", type: "select", options: STATES, group: "Client information" },
    { key: "client.communicationStatus", label: "Communication Status", type: "select", options: EMAIL_COMMUNICATION_STATUSES, group: "Client information" },
    // Database subdocument paths are accessors, so object spread drops their
    // keys/types. Read the public field properties for both hydrated and plain
    // trackers, without copying Mongoose internals into the shared registry.
    ...fields.map(field => ({
      key: field.key, label: field.label, type: field.type,
      options: field.options ? [...field.options] : undefined,
      optionColors: field.optionColors, optionInput: field.optionInput,
      required: field.required, dataLink: field.dataLink,
      computed: field.computed, unit: field.unit,
      group: "Tracker columns" as const,
    })),
  ];
  fieldRegistries.set(fields, registry);
  return registry;
}
export const emailConditionValues = (field?: TrackerField) => field?.type === "toggle" ? ["Yes", "No"] : field?.options || [];
export const emailConditionInputType = (field?: TrackerField) => field && numericTypes.has(field.type) ? "number" : field?.type === "date" ? "date" : "text";
const labels: Array<{ value: TrackerRuleOperator; label: string }> = [
  { value: "equals", label: "equals" }, { value: "not_equals", label: "does not equal" },
  { value: "is_any_of", label: "is any of" }, { value: "contains_any", label: "contains any" }, { value: "contains_all", label: "contains all" },
  { value: "contains", label: "contains" }, { value: "not_contains", label: "does not contain" },
  { value: "greater_than", label: "greater than" }, { value: "greater_than_or_equal", label: "at least" },
  { value: "less_than", label: "less than" }, { value: "less_than_or_equal", label: "at most" },
  { value: "before", label: "before" }, { value: "after", label: "after" }, { value: "on", label: "on" },
  { value: "is_empty", label: "is empty" }, { value: "is_not_empty", label: "is not empty" },
];
export function emailConditionOperators(field?: TrackerField) {
  const basic = ["equals", "not_equals", "is_empty", "is_not_empty"];
  const type = field && family(field.type);
  const allowed = type === "number" ? [...basic, "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal"]
    : type === "date" ? [...basic, "before", "after", "on", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal"]
    : type === "multi" ? [...basic, "contains_any", "contains_all", "contains", "not_contains"]
    : type === "choice" ? [...basic, "is_any_of"] : type === "text" ? [...basic, "contains", "not_contains", ...(field?.key === "client.state" ? ["is_any_of"] : [])] : basic;
  return labels.filter(item => allowed.includes(item.value)).map(item => field?.key.startsWith("client.") && ["equals", "not_equals"].includes(item.value) ? { ...item, label: item.value === "equals" ? "is" : "is not" } : item);
}
const multiple = (op: string) => ["is_any_of", "contains_any", "contains_all"].includes(op);
export function emailConditionIssue(condition: TrackerCondition, fields: TrackerField[]): string | null {
  const field = fields.find(item => item.key === condition.fieldKey);
  if (!field) return `Removed or unavailable field: ${condition.fieldKey}.`;
  if (condition.fieldType && family(condition.fieldType) !== family(field.type)) return `${field.label} changed to an incompatible field type.`;
  if (!emailConditionOperators(field).some(item => item.value === condition.operator)) return `Incompatible operator for ${field.label}.`;
  if (["is_empty", "is_not_empty"].includes(condition.operator)) return null;
  const value = condition.value;
  if (multiple(condition.operator)) {
    if (!Array.isArray(value) || !value.length || value.length > 50 || value.some(v => typeof v !== "string" || !v.trim() || v.length > 400)) return `Choose valid values for ${field.label}.`;
  } else if (!["string", "number", "boolean"].includes(typeof value) || String(value ?? "").trim() === "") return `Choose a value for ${field.label}.`;
  if (family(field.type) === "number" && number(value) === null) return `${field.label} needs a finite number.`;
  if (field.type === "date" && emailDate(value) === null) return `${field.label} needs a valid ISO date.`;
  if (field.type === "toggle" && ![true, false, "Yes", "No"].includes(value as string | boolean)) return `${field.label} needs Yes or No.`;
  if (field.options?.length && !["contains", "not_contains"].includes(condition.operator) && (Array.isArray(value) ? value : [value]).some(v => !field.options!.includes(String(v)))) return `${field.label} references a removed or invalid option.`;
  return null;
}
export function emailConditionGroupIssue(group: TrackerConditionGroup | undefined, fields: TrackerField[]): string | null {
  if (!group || !["ALL", "ANY"].includes(group.mode) || !Array.isArray(group.conditions) || !group.conditions.length || group.conditions.length > 12) return "Choose one to twelve valid matching conditions.";
  for (const condition of group.conditions) {
    if (!condition || typeof condition !== "object") return "Choose valid matching conditions.";
    const issue = emailConditionIssue(condition, fields); if (issue) return issue;
  }
  return null;
}
export type TrackerEmailContext = Readonly<{
  clientId: string; entryId: string; client: Readonly<{ clientId: string; companyName?: string; category?: string; state?: string; gstNumber?: string }>;
  values: TrackerValues; fields: TrackerField[]; financialYear?: string; trackerName: string; workflowName: string; communicationStatus: string;
}>;
/** Only the exact unique Client ID can supply both conditions and template data. */
export function createTrackerEmailContext(input: {
  entry: { clientId: string; _id?: unknown }; client: TrackerEmailContext["client"];
  values: TrackerValues; fields: TrackerField[]; financialYear?: string; trackerName: string; workflowName: string; communicationStatus?: string;
}): TrackerEmailContext {
  if (!input.client || !input.entry.clientId || input.client.clientId !== input.entry.clientId) throw Error("The tracker entry and client identity do not match.");
  const values = Object.fromEntries(input.fields.map(field => [field.key, Array.isArray(input.values[field.key]) ? [...input.values[field.key] as string[]] : input.values[field.key]])) as TrackerValues;
  for (const value of Object.values(values)) if (Array.isArray(value)) Object.freeze(value);
  return Object.freeze({ ...input, clientId: input.entry.clientId, entryId: String(input.entry._id || ""), client: Object.freeze({ ...input.client }), values: Object.freeze(values), communicationStatus: input.communicationStatus || "Not Contacted" });
}
export function emailContextValue(context: TrackerEmailContext, key: string): TrackerValue | undefined {
  switch (key) {
    case "client.category": return context.client.category;
    case "client.state": return context.client.state;
    case "client.communicationStatus": return context.communicationStatus;
    default: return context.values[key];
  }
}
export function evaluateEmailCondition(condition: TrackerCondition, context: TrackerEmailContext) {
  const fields = emailConditionFields(context.fields);
  if (emailConditionIssue(condition, fields)) return false;
  const field = fields.find(f => f.key === condition.fieldKey)!;
  const value = emailContextValue(context, condition.fieldKey);
  return evaluateTrackerCondition(condition, value === undefined ? {} : { [condition.fieldKey]: value }, field);
}
export function evaluateEmailConditionGroup(group: TrackerConditionGroup | undefined, context: TrackerEmailContext) {
  if (emailConditionGroupIssue(group, emailConditionFields(context.fields))) return false;
  const matches = group!.conditions.map(condition => evaluateEmailCondition(condition, context));
  return group!.mode === "ANY" ? matches.some(Boolean) : matches.every(Boolean);
}
export function emailCommunicationStatus(log?: { communicationStatus?: string; status?: string; mailKind?: string }) {
  return !log ? "Not Contacted" : log.communicationStatus === "replied" ? "Replied" : log.status === "draft" ? "Draft Created" : log.status === "failed" ? "Failed" : log.mailKind === "reminder" ? "Reminder Sent" : "Sent";
}
export function activeEmailRules(workflow: TrackerEmailWorkflow) {
  return (workflow.contentRules || []).map((rule, index) => ({ rule, index })).sort((a, b) => (a.rule.order ?? 0) - (b.rule.order ?? 0) || a.index - b.index).map(item => item.rule)
    .filter(rule => rule.legacyPoint || !workflow.contentMode || rule.type === (workflow.contentMode === "combinations" ? "combination" : workflow.contentMode === "statements" ? "statement" : "point"));
}
export function emailWorkflowConditionIssue(workflow: TrackerEmailWorkflow, fields: TrackerField[]) {
  const registry = emailConditionFields(fields);
  if (workflow.combinationMatchingMode !== undefined && !["first", "combine"].includes(workflow.combinationMatchingMode)) return "Unsupported combination matching mode.";
  const groups = [workflow.conditionGroup || { mode: "ALL" as const, conditions: [{ fieldKey: workflow.mainFieldKey, operator: "equals" as const, value: workflow.mainValue }] }, ...activeEmailRules(workflow).map(rule => rule.conditionGroup)];
  for (const group of groups) { const issue = emailConditionGroupIssue(group, registry); if (issue) return issue; }
  for (const point of workflow.points) { const issue = emailConditionIssue({ fieldKey: point.fieldKey, operator: "equals", value: point.value }, registry); if (issue) return issue; }
  return null;
}
