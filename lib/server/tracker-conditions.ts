import type {
  TrackerCondition,
  TrackerConditionGroup,
  TrackerRuleOperator,
  TrackerValue,
  TrackerValues,
  TrackerField,
} from "@/lib/clientTrackers";

export function parseTrackerNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() && /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim()) && Number.isFinite(Number(value)) ? Number(value) : null;
}
/** Date-only comparisons use UTC calendar days, never locale display strings. */
export function parseTrackerDate(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\S+)?$/.test(value)) return null;
  const time = Date.parse(value), dateOnly = Date.parse(value.slice(0, 10) + "T00:00:00Z");
  if (!Number.isFinite(time) || !Number.isFinite(dateOnly) || new Date(dateOnly).toISOString().slice(0, 10) !== value.slice(0, 10)) return null;
  return Date.parse(new Date(time).toISOString().slice(0, 10) + "T00:00:00Z");
}
const numberPair = (actual: number | null, expected: number | null) => actual !== null && expected !== null && Number.isFinite(actual) && Number.isFinite(expected) ? { actual, expected } : null;

export function trackerValueText(value: TrackerValue | undefined) {
  if (Array.isArray(value)) return value.join(", ");
  return value === true ? "Yes" : value === false ? "No" : String(value ?? "");
}

export function evaluateTrackerCondition(
  condition: TrackerCondition,
  values: TrackerValues,
  /** Email callers provide validated field metadata; existing table/view callers retain their semantics. */
  field?: TrackerField,
) {
  const raw = values[condition.fieldKey];
  const actual = trackerValueText(raw);
  const expected = trackerValueText(
    condition.value as TrackerValue | undefined,
  );
  const typedNumber = field && ["number", "percentage", "quantity", "currency", "progress"].includes(field.type);
  const typedDate = field?.type === "date";
  const multi = field && ["multiSelect", "tags"].includes(field.type);
  const actualNumber = typedNumber ? parseTrackerNumber(raw) : Number(actual);
  const expectedNumber = typedNumber ? parseTrackerNumber(condition.value) : Number(expected);
  const dateLike = /^\d{4}-\d{2}-\d{2}(?:T[^\s]+)?$/;
  const actualDate = typedDate ? parseTrackerDate(raw) : dateLike.test(actual) ? Date.parse(actual) : Number.NaN;
  const expectedDate = typedDate ? parseTrackerDate(condition.value) : dateLike.test(expected) ? Date.parse(expected) : Number.NaN;
  const comparable = typedDate ? numberPair(actualDate, expectedDate) : numberPair(actualNumber, expectedNumber) || numberPair(actualDate, expectedDate);
  if (field && !["is_empty", "is_not_empty"].includes(condition.operator)) {
    if (raw == null || !actual.trim() || Array.isArray(raw) && !raw.length) return false;
    if ((typedNumber || typedDate) && !comparable) return false;
    if (field.type === "toggle" && ![true, false, "Yes", "No"].includes(raw as string | boolean)) return false;
  }
  const equal = typedNumber || typedDate ? Boolean(comparable && comparable.actual === comparable.expected) : actual === expected;
  const compare = (operator: TrackerRuleOperator) => {
    switch (operator) {
      case "equals":
        return equal;
      case "not_equals":
        return !equal;
      case "is_empty":
        return !actual.trim();
      case "is_not_empty":
        return Boolean(actual.trim());
      case "contains":
        return multi && Array.isArray(raw) ? raw.includes(expected) : actual.toLowerCase().includes(expected.toLowerCase());
      case "not_contains":
        return multi && Array.isArray(raw) ? !raw.includes(expected) : !actual.toLowerCase().includes(expected.toLowerCase());
      case "greater_than":
        return Boolean(comparable && comparable.actual > comparable.expected);
      case "greater_than_or_equal":
        return Boolean(comparable && comparable.actual >= comparable.expected);
      case "less_than":
        return Boolean(comparable && comparable.actual < comparable.expected);
      case "less_than_or_equal":
        return Boolean(comparable && comparable.actual <= comparable.expected);
      case "is_any_of":
        return Array.isArray(condition.value) && condition.value.includes(actual);
      case "contains_any":
        return Array.isArray(values[condition.fieldKey]) && Array.isArray(condition.value) && condition.value.some(value => (values[condition.fieldKey] as string[]).includes(value));
      case "contains_all":
        return Array.isArray(values[condition.fieldKey]) && Array.isArray(condition.value) && condition.value.every(value => (values[condition.fieldKey] as string[]).includes(value));
      case "before":
        return Boolean(numberPair(actualDate, expectedDate) && actualDate! < expectedDate!);
      case "after":
        return Boolean(numberPair(actualDate, expectedDate) && actualDate! > expectedDate!);
      case "on":
        return typedDate ? Boolean(numberPair(actualDate, expectedDate) && actualDate === expectedDate) : parseTrackerDate(actual) !== null && parseTrackerDate(actual) === parseTrackerDate(expected);
      default: return false;
    }
  };
  return compare(condition.operator);
}

export function legacyWorkflowCondition(
  mainFieldKey: string,
  mainValue: string,
): TrackerConditionGroup {
  return {
    mode: "ALL",
    conditions: [
      { fieldKey: mainFieldKey, operator: "equals", value: mainValue },
    ],
  };
}

export function evaluateTrackerConditionGroup(
  group: TrackerConditionGroup | undefined,
  values: TrackerValues,
) {
  if (!group?.conditions.length) return false;
  const matches = group.conditions.map((condition) =>
    evaluateTrackerCondition(condition, values),
  );
  return group.mode === "ANY" ? matches.some(Boolean) : matches.every(Boolean);
}
