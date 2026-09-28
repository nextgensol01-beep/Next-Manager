import {
  DEFAULT_STATUS_FIELD,
  TRACKER_COMPUTED_KINDS,
  TRACKER_DATA_LINK_SOURCES,
  TRACKER_FIELD_TYPES,
  TRACKER_OPTION_COLORS,
  trackerFieldKey,
  type TrackerComputed,
  type TrackerCondition,
  type TrackerDataLink,
  type TrackerField,
  type TrackerOptionColor,
} from "@/lib/clientTrackers";

const DATA_LINK_DISPLAYS: Record<
  TrackerDataLink["source"],
  readonly TrackerDataLink["display"][]
> = {
  purchaseInvoices: [
    "yesNo",
    "count",
    "status",
    "latestDate",
    "coverageStatus",
    "monthsCovered",
    "requiredMonths",
    "missingMonths",
  ],
  saleInvoices: [
    "yesNo",
    "count",
    "status",
    "latestDate",
    "coverageStatus",
    "monthsCovered",
    "requiredMonths",
    "missingMonths",
  ],
  annualReturn: ["yesNo", "status", "latestDate"],
  purchaseUploads: [
    "yesNo",
    "count",
    "quantity",
    "invoiceCount",
    "cat1",
    "cat2",
    "cat3",
    "cat4",
    "uploadStatus",
  ],
  saleUploads: [
    "yesNo",
    "count",
    "quantity",
    "invoiceCount",
    "cat1",
    "cat2",
    "cat3",
    "cat4",
    "uploadStatus",
  ],
  // Kept only so existing trackers can retain their prior combined link; it is not offered for new columns.
  uploadedData: ["yesNo", "count", "quantity", "invoiceCount"],
};

function cleanDataLink(value: unknown): TrackerDataLink | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = (value as Record<string, unknown>).source;
  const display = (value as Record<string, unknown>).display;
  if (!TRACKER_DATA_LINK_SOURCES.includes(source as TrackerDataLink["source"]))
    return undefined;
  const typedSource = source as TrackerDataLink["source"];
  if (
    !DATA_LINK_DISPLAYS[typedSource].includes(
      display as TrackerDataLink["display"],
    )
  )
    return undefined;
  return {
    source: typedSource,
    display: display as TrackerDataLink["display"],
  };
}

const RULE_OPERATORS = new Set([
  "equals",
  "not_equals",
  "is_empty",
  "is_not_empty",
  "contains",
  "not_contains",
  "greater_than",
  "greater_than_or_equal",
  "less_than",
  "less_than_or_equal",
]);

function cleanComputed(value: unknown): TrackerComputed | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const rawKind = typeof raw.kind === "string" ? raw.kind : "";
  if (!TRACKER_COMPUTED_KINDS.includes(rawKind as TrackerComputed["kind"]))
    return undefined;
  const kind = rawKind as TrackerComputed["kind"];
  const fieldKey = (key: "primaryFieldKey" | "secondaryFieldKey") =>
    typeof raw[key] === "string" ? raw[key].trim() : "";
  const label = (key: "matchedLabel" | "fallbackLabel", fallback: string) =>
    typeof raw[key] === "string" && raw[key].trim()
      ? raw[key].trim().slice(0, 80)
      : fallback;
  if (kind === "combinedStatus") {
    const group = raw.conditionGroup as
      | { mode?: unknown; conditions?: unknown }
      | undefined;
    if (
      !group ||
      (group.mode !== "ALL" && group.mode !== "ANY") ||
      !Array.isArray(group.conditions) ||
      !group.conditions.length ||
      group.conditions.length > 12
    )
      return undefined;
    const conditions = group.conditions.map(
      (item) => item as Record<string, unknown>,
    );
    if (
      conditions.some(
        (condition) =>
          typeof condition.fieldKey !== "string" ||
          !RULE_OPERATORS.has(String(condition.operator)) ||
          !["undefined", "string", "number", "boolean"].includes(
            typeof condition.value,
          ),
      )
    )
      return undefined;
    return {
      kind,
      conditionGroup: {
        mode: group.mode,
        conditions: conditions.map((condition) => ({
          fieldKey: String(condition.fieldKey),
          operator: String(condition.operator) as TrackerCondition["operator"],
          value: condition.value as string | number | boolean | undefined,
        })),
      },
      matchedLabel: label("matchedLabel", "Ready"),
      fallbackLabel: label("fallbackLabel", "Pending"),
    };
  }
  const primaryFieldKey = fieldKey("primaryFieldKey");
  const secondaryFieldKey = fieldKey("secondaryFieldKey");
  if (
    !primaryFieldKey ||
    !secondaryFieldKey ||
    primaryFieldKey === secondaryFieldKey
  )
    return undefined;
  return { kind, primaryFieldKey, secondaryFieldKey };
}

export function cleanTrackerFields(
  rawFields: unknown,
  includeStatus = true,
): TrackerField[] | null {
  const supplied = Array.isArray(rawFields) ? rawFields : [];
  const fields: TrackerField[] = [];
  const usedKeys = new Set<string>();
  const hasStatus = supplied.some(
    (raw) =>
      raw &&
      typeof raw === "object" &&
      (raw as Record<string, unknown>).type === "status",
  );
  if (includeStatus && !hasStatus) {
    fields.push(DEFAULT_STATUS_FIELD);
    usedKeys.add(DEFAULT_STATUS_FIELD.key);
  }
  for (const raw of supplied) {
    if (!raw || typeof raw !== "object") continue;
    const source = raw as Record<string, unknown>;
    const label = typeof source.label === "string" ? source.label.trim() : "";
    const type =
      typeof source.type === "string" &&
      TRACKER_FIELD_TYPES.includes(source.type as TrackerField["type"])
        ? (source.type as TrackerField["type"])
        : "text";
    if (!label) continue;
    if (type === "status") {
      if (!includeStatus) continue;
      if (usedKeys.has(DEFAULT_STATUS_FIELD.key)) return null;
      fields.push(DEFAULT_STATUS_FIELD);
      usedKeys.add(DEFAULT_STATUS_FIELD.key);
      continue;
    }
    const explicitKey =
      typeof source.key === "string"
        ? source.key.trim().replace(/[^a-zA-Z0-9]/g, "")
        : "";
    const key = explicitKey || trackerFieldKey(label);
    if (!key || usedKeys.has(key)) return null;
    const options = Array.isArray(source.options)
      ? source.options
          .filter((option): option is string => typeof option === "string")
          .map((option) => option.trim())
          .filter(Boolean)
      : [];
    const isChoiceField = ["select", "multiSelect", "tags"].includes(type);
    if (type === "select" && options.length < 2) return null;
    if ((type === "multiSelect" || type === "tags") && options.length < 1)
      return null;
    const dataLink = cleanDataLink(source.dataLink);
    const computed = cleanComputed(source.computed);
    if (source.computed && !computed) return null;
    if (dataLink && computed) return null;
    const computedType =
      computed?.kind === "percentage" || computed?.kind === "difference"
        ? "number"
        : computed?.kind === "combinedStatus"
          ? "select"
          : computed
            ? "text"
            : type;
    const computedOptions =
      computed?.kind === "combinedStatus"
        ? [
            ...new Set([
              computed.matchedLabel || "Ready",
              computed.fallbackLabel || "Pending",
            ]),
          ]
        : undefined;
    const sourceColors =
      source.optionColors && typeof source.optionColors === "object"
        ? (source.optionColors as Record<string, unknown>)
        : {};
    const optionColors =
      computedType === "select" || isChoiceField
        ? Object.fromEntries(
            options.map((option, index) => [
              option,
              TRACKER_OPTION_COLORS.includes(
                sourceColors[option] as TrackerOptionColor,
              )
                ? (sourceColors[option] as TrackerOptionColor)
                : TRACKER_OPTION_COLORS[index % TRACKER_OPTION_COLORS.length],
            ]),
          )
        : undefined;
    usedKeys.add(key);
    fields.push({
      key,
      label,
      type: computedType,
      options:
        computedOptions ||
        (["select", "multiSelect", "tags"].includes(computedType)
          ? [...new Set(options)]
          : undefined),
      optionColors,
      dataLink,
      computed,
      unit:
        type === "quantity" && typeof source.unit === "string"
          ? source.unit.trim().slice(0, 20)
          : undefined,
    });
  }
  const fieldsByKey = new Map(fields.map((field) => [field.key, field]));
  if (
    fields.some((field) => {
      const computed = field.computed;
      if (!computed) return false;
      if (computed.kind === "combinedStatus")
        return computed.conditionGroup?.conditions.some((condition) => {
          const reference = fieldsByKey.get(condition.fieldKey);
          return !reference || reference.computed;
        });
      const primary = fieldsByKey.get(computed.primaryFieldKey || "");
      const secondary = fieldsByKey.get(computed.secondaryFieldKey || "");
      return !primary || !secondary || primary.computed || secondary.computed;
    })
  )
    return null;
  return fields.length ? fields : null;
}
