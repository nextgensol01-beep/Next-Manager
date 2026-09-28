import { evaluateTrackerConditionGroup } from "@/lib/server/tracker-conditions";
import type {
  TrackerField,
  TrackerValue,
  TrackerValues,
} from "@/lib/clientTrackers";

function numberValue(value: TrackerValue | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  // Coverage displays such as "9 / 12" intentionally contribute their covered side.
  const parsed = Number(
    String(value ?? "")
      .split("/")[0]
      .trim(),
  );
  return Number.isFinite(parsed) ? parsed : null;
}

function textValue(value: TrackerValue | undefined) {
  if (typeof value === "number")
    return Number.isInteger(value)
      ? String(value)
      : String(Number(value.toFixed(2)));
  return String(value ?? "").trim();
}

/** Resolves the first computed-field set from values already available to a tracker row. */
export function resolveTrackerComputedValues(
  fields: TrackerField[],
  sourceValues: TrackerValues,
) {
  const values: TrackerValues = { ...sourceValues };
  fields.forEach((field) => {
    const computed = field.computed;
    if (!computed) return;
    if (computed.kind === "combinedStatus") {
      values[field.key] = evaluateTrackerConditionGroup(
        computed.conditionGroup,
        values,
      )
        ? computed.matchedLabel || "Ready"
        : computed.fallbackLabel || "Pending";
      return;
    }
    const primary = numberValue(values[computed.primaryFieldKey || ""]);
    const secondary = numberValue(values[computed.secondaryFieldKey || ""]);
    if (primary === null || secondary === null) {
      values[field.key] = "";
      return;
    }
    if (computed.kind === "percentage") {
      values[field.key] =
        secondary > 0 ? Number(((primary / secondary) * 100).toFixed(2)) : "";
      return;
    }
    if (computed.kind === "difference") {
      values[field.key] = Number((primary - secondary).toFixed(2));
      return;
    }
    values[field.key] = `${textValue(primary)} / ${textValue(secondary)}`;
  });
  return values;
}
