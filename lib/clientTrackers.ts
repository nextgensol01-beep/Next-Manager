export const TRACKER_FIELD_TYPES = [
  "status",
  "toggle",
  "select",
  "text",
  "longText",
  "multiSelect",
  "tags",
  "number",
  "percentage",
  "quantity",
  "currency",
  "progress",
  "date",
] as const;
export type TrackerFieldType = (typeof TRACKER_FIELD_TYPES)[number];

export type TrackerField = {
  key: string;
  label: string;
  type: TrackerFieldType;
  options?: string[];
  optionColors?: Record<string, TrackerOptionColor>;
  /** UI-only draft that deliberately retains a trailing comma while options are being typed. */
  optionInput?: string;
  required?: boolean;
  dataLink?: TrackerDataLink;
  computed?: TrackerComputed;
  /** Display unit for a manual quantity column, for example MT or kg. */
  unit?: string;
};

export const TRACKER_DATA_LINK_SOURCES = [
  "purchaseInvoices",
  "saleInvoices",
  "annualReturn",
  "purchaseUploads",
  "saleUploads",
  "uploadedData",
] as const;
export type TrackerDataLinkSource = (typeof TRACKER_DATA_LINK_SOURCES)[number];
export type TrackerDataLinkDisplay =
  | "yesNo"
  | "count"
  | "status"
  | "latestDate"
  | "quantity"
  | "invoiceCount"
  | "cat1"
  | "cat2"
  | "cat3"
  | "cat4"
  | "coverageStatus"
  | "monthsCovered"
  | "requiredMonths"
  | "missingMonths"
  | "uploadStatus";
export type TrackerDataLink = {
  source: TrackerDataLinkSource;
  display: TrackerDataLinkDisplay;
};

export const TRACKER_COMPUTED_KINDS = [
  "percentage",
  "difference",
  "progress",
  "combinedStatus",
] as const;
export type TrackerComputedKind = (typeof TRACKER_COMPUTED_KINDS)[number];
/** Derived at read time from tracker values; computed values are never stored in an entry. */
export type TrackerComputed = {
  kind: TrackerComputedKind;
  primaryFieldKey?: string;
  secondaryFieldKey?: string;
  conditionGroup?: TrackerConditionGroup;
  matchedLabel?: string;
  fallbackLabel?: string;
};

export const CLIENT_TRACKER_CATEGORIES = [
  "PWP",
  "Producer",
  "Importer",
  "Brand Owner",
  "SIMP",
] as const;
export type ClientTrackerCategory = (typeof CLIENT_TRACKER_CATEGORIES)[number];

export type TrackerEmailPointFormat = "point" | "statement";
export type TrackerEmailPoint = {
  id: string;
  fieldKey: string;
  value: string;
  statement: string;
  format?: TrackerEmailPointFormat;
};
/** Attach either one shared managed document or the newest matching client document. */
export type TrackerEmailAttachment = {
  id: string;
  source?: "shared" | "client_latest";
  /** Required when source is shared. The selected managed Drive document is used for every client. */
  documentId?: string;
  category?: "compliance" | "financial" | "invoices" | "certificates" | "other";
  documentKind?: "general" | "epr-certificate";
  financialYear?: "tracker" | "any";
  conditionGroup?: TrackerConditionGroup;
};
/** Determines the suggested recipients; every client can still be edited before delivery. */
export type TrackerRecipientStrategy =
  | "selected"
  | "primary"
  | "all"
  | "per_client";
export type TrackerEmailContentRule = {
  id: string;
  type: "combination" | "statement" | "point";
  conditionGroup: TrackerConditionGroup;
  action?: "include" | "skip";
  content?: string;
  order?: number;
};
export type TrackerEmailWorkflow = {
  id: string;
  name: string;
  description?: string;
  /** The one column-content approach selected when this workflow is created. */
  contentMode?: "points" | "statements" | "combinations";
  mainFieldKey: string;
  mainValue: string;
  subject: string;
  body: string;
  points: TrackerEmailPoint[];
  reminderSubject?: string;
  reminderBody?: string;
  /** Number of blank lines inserted before the configured Gmail signature. */
  signatureGap?: number;
  /** New workflows use this; old mainFieldKey/mainValue are treated as one ALL condition. */
  conditionGroup?: TrackerConditionGroup;
  followUp?: { enabled: boolean; daysAfter: number; ownerEmail?: string };
  attachments?: TrackerEmailAttachment[];
  recipientStrategy?: TrackerRecipientStrategy;
  /** New conditional content; legacy points remain supported unchanged. */
  contentRules?: TrackerEmailContentRule[];
};

export type TrackerRuleOperator =
  | "equals"
  | "not_equals"
  | "is_empty"
  | "is_not_empty"
  | "contains"
  | "not_contains"
  | "greater_than"
  | "greater_than_or_equal"
  | "less_than"
  | "less_than_or_equal";
export type TrackerCondition = {
  fieldKey: string;
  operator: TrackerRuleOperator;
  value?: string | number | boolean;
};
export type TrackerConditionGroup = {
  mode: "ALL" | "ANY";
  conditions: TrackerCondition[];
};
export type TrackerSavedView = {
  id: string;
  name: string;
  conditionGroup: TrackerConditionGroup;
};

export const TRACKER_EMAIL_PRESETS = [
  {
    id: "purchase",
    name: "Request purchase invoices",
    subject: "Purchase invoices required for {{tracker.financialYear}}",
    body: "Dear {{client.companyName}},\n\nPlease share your purchase invoices for {{tracker.financialYear}}.\n\n{{points}}\n\nRegards,",
  },
  {
    id: "sale",
    name: "Request sale invoices",
    subject: "Sale invoices required for {{tracker.financialYear}}",
    body: "Dear {{client.companyName}},\n\nPlease share your sale invoices for {{tracker.financialYear}}.\n\n{{points}}\n\nRegards,",
  },
  {
    id: "documents",
    name: "Missing documents reminder",
    subject: "Documents required for {{tracker.financialYear}}",
    body: "Dear {{client.companyName}},\n\nTo continue your work for {{tracker.financialYear}}, please provide the following:\n\n{{points}}\n\nRegards,",
  },
  {
    id: "annual",
    name: "Annual return follow-up",
    subject: "Annual return follow-up for {{tracker.financialYear}}",
    body: "Dear {{client.companyName}},\n\nWe are following up regarding your annual return work.\n\n{{points}}\n\nRegards,",
  },
] as const;

export type TrackerOptionColor =
  | "slate"
  | "blue"
  | "violet"
  | "amber"
  | "emerald"
  | "rose";
export const TRACKER_OPTION_COLORS: TrackerOptionColor[] = [
  "slate",
  "blue",
  "violet",
  "amber",
  "emerald",
  "rose",
];

export type TrackerValue = string | number | boolean | string[];
export type TrackerValues = Record<string, TrackerValue>;

export const DEFAULT_STATUS_OPTIONS = [
  "Not Started",
  "In Progress",
  "Done",
  "Blocked",
  "Not Applicable",
];

export const DEFAULT_STATUS_FIELD: TrackerField = {
  key: "status",
  label: "Status",
  type: "status",
  options: DEFAULT_STATUS_OPTIONS,
  required: true,
};

export const CLIENT_TRACKER_DETAIL_OPTIONS = [
  { key: "state", label: "State" },
  { key: "legalName", label: "Legal name" },
  { key: "gstNumber", label: "GST number" },
  { key: "registrationNumber", label: "Registration number" },
  { key: "address", label: "Address" },
] as const;
export type ClientTrackerDetailKey =
  (typeof CLIENT_TRACKER_DETAIL_OPTIONS)[number]["key"];

export function trackerFieldKey(label: string) {
  const words = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
  return words
    .map((word, index) =>
      index === 0 ? word : `${word[0].toUpperCase()}${word.slice(1)}`,
    )
    .join("");
}

export function defaultTrackerValue(field: TrackerField): TrackerValue {
  if (field.dataLink || field.computed) return "";
  if (field.type === "toggle") return false;
  if (field.type === "status") return field.options?.[0] || "Not Started";
  if (field.type === "multiSelect" || field.type === "tags") return [];
  return "";
}

export function initialTrackerValues(fields: TrackerField[]): TrackerValues {
  return Object.fromEntries(
    fields.map((field) => [field.key, defaultTrackerValue(field)]),
  );
}
