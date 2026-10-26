import type { TrackerCondition, TrackerField } from "./clientTrackers";
import { emailConditionIssue, emailConditionOperators } from "./tracker-email-context";

/** Preserve a comparison only when the existing validator accepts it for the new field. */
export function changeEmailConditionField(condition: TrackerCondition, field: TrackerField): TrackerCondition {
  const operator = emailConditionOperators(field).some(item => item.value === condition.operator) ? condition.operator : "equals";
  const candidate = { ...condition, fieldKey: field.key, fieldType: field.type, operator };
  if (["is_empty", "is_not_empty"].includes(operator)) return { ...candidate, value: undefined };
  return emailConditionIssue(candidate, [field]) ? { ...candidate, value: ["is_any_of", "contains_any", "contains_all"].includes(operator) ? [] : "" } : candidate;
}
