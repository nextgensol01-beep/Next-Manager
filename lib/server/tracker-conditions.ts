import type {
  TrackerCondition,
  TrackerConditionGroup,
  TrackerRuleOperator,
  TrackerValue,
  TrackerValues,
} from "@/lib/clientTrackers";

export function trackerValueText(value: TrackerValue | undefined) {
  if (Array.isArray(value)) return value.join(", ");
  return value === true ? "Yes" : value === false ? "No" : String(value ?? "");
}

export function evaluateTrackerCondition(
  condition: TrackerCondition,
  values: TrackerValues,
) {
  const actual = trackerValueText(values[condition.fieldKey]);
  const expected = trackerValueText(
    condition.value as TrackerValue | undefined,
  );
  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  const numeric =
    Number.isFinite(actualNumber) && Number.isFinite(expectedNumber);
  const dateLike = /^\d{4}-\d{2}-\d{2}(?:T[^\s]+)?$/;
  const actualDate = dateLike.test(actual) ? Date.parse(actual) : Number.NaN;
  const expectedDate = dateLike.test(expected) ? Date.parse(expected) : Number.NaN;
  const comparable = numeric
    ? { actual: actualNumber, expected: expectedNumber }
    : Number.isFinite(actualDate) && Number.isFinite(expectedDate)
      ? { actual: actualDate, expected: expectedDate }
      : null;
  const compare = (operator: TrackerRuleOperator) => {
    switch (operator) {
      case "equals":
        return actual === expected;
      case "not_equals":
        return actual !== expected;
      case "is_empty":
        return !actual.trim();
      case "is_not_empty":
        return Boolean(actual.trim());
      case "contains":
        return actual.toLowerCase().includes(expected.toLowerCase());
      case "not_contains":
        return !actual.toLowerCase().includes(expected.toLowerCase());
      case "greater_than":
        return Boolean(comparable && comparable.actual > comparable.expected);
      case "greater_than_or_equal":
        return Boolean(comparable && comparable.actual >= comparable.expected);
      case "less_than":
        return Boolean(comparable && comparable.actual < comparable.expected);
      case "less_than_or_equal":
        return Boolean(comparable && comparable.actual <= comparable.expected);
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
