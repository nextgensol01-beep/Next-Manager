import { z } from "zod";
import { QUOTATION_STATUSES } from "@/lib/quotationRules";
import { ANNUAL_RETURN_STATUSES } from "@/lib/annualReturnStatus";
import type { ClientCustomFieldDefinition, ClientCustomFieldType } from "@/lib/clientCustomFields";

export const REPORT_STUDIO_SOURCE_IDS = [
  "clients", "financial-years", "pibo-targets", "pwp-credits", "annual-returns",
  "invoice-tracking", "quotations", "billing", "payments", "cpcb-uploads",
  "credit-transactions", "documents", "tasks", "activities", "contacts",
] as const;
export type ReportStudioSource = (typeof REPORT_STUDIO_SOURCE_IDS)[number];

export const REPORT_STUDIO_SOURCES: Array<{
  id: ReportStudioSource;
  label: string;
  description: string;
  grain: string;
}> = [
  { id: "clients", label: "Clients", description: "Client records with safely aggregated related data", grain: "One row per client" },
  { id: "financial-years", label: "Financial Year Records", description: "Clients having a record for the selected financial year", grain: "One row per client and selected FY" },
  { id: "pibo-targets", label: "PIBO Targets", description: "Producer, Importer, and Brand Owner target obligations", grain: "One row per PIBO client and selected FY" },
  { id: "pwp-credits", label: "PWP Credits", description: "Generated, sold, and remaining PWP credits", grain: "One row per PWP client and selected FY" },
  { id: "annual-returns", label: "Annual Returns", description: "Clients with an Annual Return record in the selected FY", grain: "One row per client Annual Return" },
  { id: "invoice-tracking", label: "Invoice Tracking", description: "Sale and purchase invoice coverage by client", grain: "One row per client and selected FY" },
  { id: "quotations", label: "Linked Quotations", description: "Clients with quotations linked by clientId", grain: "One row per client with linked quotation aggregates" },
  { id: "billing", label: "Billing", description: "Clients with a billing record in the selected FY", grain: "One row per client billing" },
  { id: "payments", label: "Payments", description: "Clients with payments received in the selected FY", grain: "One row per paying client" },
  { id: "cpcb-uploads", label: "CPCB Uploads", description: "CPCB upload records by client and financial year", grain: "One row per client upload summary" },
  { id: "credit-transactions", label: "Credit Transactions", description: "Inbound and outbound credit movement by client", grain: "One row per client transaction summary" },
  { id: "documents", label: "Documents", description: "Client document inventory", grain: "One row per client document summary" },
  { id: "tasks", label: "Tasks & Follow-ups", description: "Client work items and overdue actions", grain: "One row per client task summary" },
  { id: "activities", label: "Activities", description: "Persisted client timeline activity", grain: "One row per client activity summary" },
  { id: "contacts", label: "People & Contacts", description: "People related to one or more saved clients", grain: "One row per client contact summary" },
];

export type ReportStudioFieldType = "string" | "string-list" | "currency-list" | "number" | "quantity" | "currency" | "percentage" | "boolean" | "date";
export type ReportStudioFieldRole = "dimension" | "metric";
export type ReportStudioAggregate = "first" | "sum" | "average" | "count-distinct";

export const REPORT_STUDIO_OPERATOR_IDS = [
  "eq", "neq", "gt", "lt", "gte", "lte", "contains", "not_contains",
  "empty", "not_empty", "between", "in", "not_in", "before", "after",
] as const;
export type ReportStudioOperator = (typeof REPORT_STUDIO_OPERATOR_IDS)[number];

export const REPORT_STUDIO_OPERATOR_LABELS: Record<ReportStudioOperator, string> = {
  eq: "equals",
  neq: "does not equal",
  gt: "greater than",
  lt: "less than",
  gte: "greater than or equal",
  lte: "less than or equal",
  contains: "contains",
  not_contains: "does not contain",
  empty: "is empty",
  not_empty: "is not empty",
  between: "is between",
  in: "is one of",
  not_in: "is not one of",
  before: "is before",
  after: "is after",
};

const STRING_OPERATORS: ReportStudioOperator[] = ["eq", "neq", "contains", "not_contains", "empty", "not_empty", "in", "not_in"];
const NUMBER_OPERATORS: ReportStudioOperator[] = ["eq", "neq", "gt", "lt", "gte", "lte", "between", "empty", "not_empty"];
const DATE_OPERATORS: ReportStudioOperator[] = ["eq", "neq", "before", "after", "between", "empty", "not_empty"];
const BOOLEAN_OPERATORS: ReportStudioOperator[] = ["eq", "neq"];

export type ReportStudioFieldDefinition = {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  group: string;
  type: ReportStudioFieldType;
  role: ReportStudioFieldRole;
  aggregate: ReportStudioAggregate;
  operators: ReportStudioOperator[];
  options?: string[];
  sources?: ReportStudioSource[];
  applicableCategories?: string[];
};

function field(definition: Omit<ReportStudioFieldDefinition, "operators" | "aggregate"> & Partial<Pick<ReportStudioFieldDefinition, "operators" | "aggregate">>): ReportStudioFieldDefinition {
  const operators = definition.operators || (
    definition.type === "date" ? DATE_OPERATORS
      : definition.type === "boolean" ? BOOLEAN_OPERATORS
        : ["number", "quantity", "currency", "percentage"].includes(definition.type) ? NUMBER_OPERATORS
          : STRING_OPERATORS
  );
  return { ...definition, operators, aggregate: definition.aggregate || (definition.role === "metric" ? "sum" : "first") };
}

const ALL_SOURCES = [...REPORT_STUDIO_SOURCE_IDS];
const CLIENT_CATEGORIES = ["PWP", "Producer", "Importer", "Brand Owner", "SIMP"];

const BASE_FIELDS: ReportStudioFieldDefinition[] = [
  field({ id: "target.overall.progress", label: "Target Progress", shortLabel: "Progress", description: "Achievement divided by target; clients with no target have no percentage", group: "Overall Targets", type: "percentage", role: "metric", aggregate: "average", sources: ALL_SOURCES }),
  field({ id: "client.companyName", label: "Company Name", shortLabel: "Client", description: "Saved client company name", group: "Client", type: "string", role: "dimension", sources: ALL_SOURCES }),
  field({ id: "client.legalName", label: "Legal Name", shortLabel: "Legal Name", description: "Saved legal entity name", group: "Client", type: "string", role: "dimension", sources: ALL_SOURCES }),
  field({ id: "client.clientId", label: "Client ID", shortLabel: "Client ID", description: "Relational client identifier", group: "Client", type: "string", role: "dimension", sources: ALL_SOURCES }),
  field({ id: "client.category", label: "Client Type", shortLabel: "Type", description: "PWP, Producer, Importer, Brand Owner, or SIMP", group: "Client", type: "string", role: "dimension", options: CLIENT_CATEGORIES, sources: ALL_SOURCES }),
  field({ id: "client.state", label: "State", shortLabel: "State", description: "Client registration state", group: "Client", type: "string", role: "dimension", sources: ALL_SOURCES }),
  field({ id: "client.gstNumber", label: "GST Number", shortLabel: "GST", description: "Saved client GST registration number", group: "Client", type: "string", role: "dimension", sources: ALL_SOURCES }),
  field({ id: "client.registrationNumber", label: "Registration Number", shortLabel: "Registration", description: "Saved EPR or registration number", group: "Client", type: "string", role: "dimension", sources: ALL_SOURCES }),
  field({ id: "client.registrationDate", label: "Client Added Date", shortLabel: "Added", description: "Date the saved client record was created", group: "Client", type: "date", role: "dimension", sources: ALL_SOURCES }),
  field({ id: "client.registeredThisFY", label: "Registered This FY", shortLabel: "New This FY", description: "Whether the client was added during the selected financial year", group: "Client", type: "boolean", role: "dimension", sources: ALL_SOURCES }),
  field({ id: "client.count", label: "Client Count", shortLabel: "Clients", description: "Distinct qualifying clients", group: "Client", type: "number", role: "metric", aggregate: "sum", sources: ALL_SOURCES }),
  field({ id: "financialYear.year", label: "Financial Year", shortLabel: "FY", description: "Selected financial-year relationship", group: "Financial Year", type: "string", role: "dimension", sources: ALL_SOURCES }),
  field({ id: "financialYear.hasRecord", label: "FY Record Exists", shortLabel: "FY Record", description: "Whether the client has a Financial Year record", group: "Financial Year", type: "boolean", role: "dimension", sources: ALL_SOURCES }),
  field({ id: "quotation.statuses", label: "Linked Quotation Status", shortLabel: "Quote Status", description: "Statuses of quotations linked by clientId in the selected FY", group: "Quotations", type: "string-list", role: "dimension", options: [...QUOTATION_STATUSES], sources: ALL_SOURCES }),
  field({ id: "quotation.acceptedCount", label: "Accepted Quotation Count", shortLabel: "Accepted Quotes", description: "Count of linked accepted quotations", group: "Quotations", type: "number", role: "metric", sources: ALL_SOURCES }),
  field({ id: "quotation.count", label: "Linked Quotation Count", shortLabel: "Quotations", description: "All linked quotations in the selected FY", group: "Quotations", type: "number", role: "metric", sources: ALL_SOURCES }),
  field({ id: "quotation.acceptedValue", label: "Accepted Quotation Value", shortLabel: "Accepted Value", description: "Value of current revisions for linked accepted quotations", group: "Quotations", type: "currency", role: "metric", sources: ALL_SOURCES }),
  field({ id: "quotation.numbers", label: "Quotation Numbers", shortLabel: "Quotations", description: "Linked quotation numbers in the selected FY", group: "Quotations", type: "string-list", role: "dimension", sources: ALL_SOURCES }),
  field({ id: "billing.total", label: "Total Billing", shortLabel: "Billed", description: "Billing total for the selected FY", group: "Billing & Payments", type: "currency", role: "metric", sources: ALL_SOURCES }),
  field({ id: "payment.received", label: "Payment Received", shortLabel: "Received", description: "Payments recorded for the selected FY", group: "Billing & Payments", type: "currency", role: "metric", sources: ALL_SOURCES }),
  field({ id: "payment.count", label: "Payment Count", shortLabel: "Payments", description: "Payment records in the selected FY", group: "Billing & Payments", type: "number", role: "metric", sources: ALL_SOURCES }),
  field({ id: "billing.outstanding", label: "Outstanding", shortLabel: "Outstanding", description: "Billing total minus payments received", group: "Billing & Payments", type: "currency", role: "metric", sources: ALL_SOURCES }),
  field({ id: "billing.invoiceCreated", label: "Billing Invoice Created", shortLabel: "Invoice Created", description: "Whether the billing workflow has created an invoice", group: "Billing & Payments", type: "boolean", role: "dimension", sources: ALL_SOURCES }),
  field({ id: "payment.status", label: "Payment Status", shortLabel: "Payment", description: "Paid, partial, unpaid, or no billing", group: "Billing & Payments", type: "string", role: "dimension", options: ["paid", "partial", "unpaid", "no-billing"], sources: ALL_SOURCES }),
  field({ id: "annualReturn.status", label: "Annual Return Status", shortLabel: "AR Status", description: "Annual Return status for the selected FY", group: "Compliance", type: "string", role: "dimension", options: [...ANNUAL_RETURN_STATUSES, "Not recorded"], sources: ALL_SOURCES }),
  field({ id: "annualReturn.completionPercent", label: "Annual Return Workflow Progress %", shortLabel: "AR Progress %", description: "Progress through invoice coverage, upload, billing, accepted quotation where required, filing, and verification; Not Required is excluded", group: "Compliance", type: "percentage", role: "metric", aggregate: "average", sources: ALL_SOURCES }),
  field({ id: "invoice.recordCount", label: "Invoice Tracking Records", shortLabel: "Invoices", description: "Sale and purchase invoice tracking records", group: "Compliance", type: "number", role: "metric", sources: ALL_SOURCES }),
  field({ id: "invoice.saleMonthsReceived", label: "Sale Months Received", shortLabel: "Sale Months", description: "Covered sale-invoice months in the selected FY", group: "Compliance", type: "number", role: "metric", sources: ALL_SOURCES }),
  field({ id: "invoice.purchaseMonthsReceived", label: "Purchase Months Received", shortLabel: "Purchase Months", description: "Covered purchase-invoice months in the selected FY", group: "Compliance", type: "number", role: "metric", sources: ALL_SOURCES }),
  field({ id: "invoice.coveragePercent", label: "Invoice Coverage %", shortLabel: "Invoice Coverage", description: "Covered sale and purchase months out of 24 applicable slots", group: "Compliance", type: "percentage", role: "metric", aggregate: "average", sources: ALL_SOURCES }),
  field({ id: "upload.quantity", label: "CPCB Uploaded Quantity", shortLabel: "Upload Qty", description: "CPCB upload quantity without inferring workflow progress", group: "Compliance", type: "quantity", role: "metric", sources: ALL_SOURCES }),
  field({ id: "upload.recordCount", label: "CPCB Upload Records", shortLabel: "Uploads", description: "Number of CPCB upload entries", group: "Compliance", type: "number", role: "metric", sources: ALL_SOURCES }),
  field({ id: "pwp.generated", label: "Generated Credits", shortLabel: "Generated", description: "PWP credits generated for selected dimensions", group: "PWP Credits", type: "quantity", role: "metric", sources: ALL_SOURCES }),
  field({ id: "pwp.sold", label: "Credits Sold", shortLabel: "Sold", description: "PWP credits transferred out", group: "PWP Credits", type: "quantity", role: "metric", sources: ALL_SOURCES }),
  field({ id: "pwp.remaining", label: "Remaining Credits", shortLabel: "Credits Left", description: "Generated minus sold credits", group: "PWP Credits", type: "quantity", role: "metric", sources: ALL_SOURCES }),
  field({ id: "transaction.inboundCount", label: "Inbound Transaction Count", shortLabel: "Inbound Txns", description: "Credit transactions received by the client", group: "Credit Transactions", type: "number", role: "metric", sources: ALL_SOURCES }),
  field({ id: "transaction.outboundCount", label: "Outbound Transaction Count", shortLabel: "Outbound Txns", description: "Credit transactions sold by the client", group: "Credit Transactions", type: "number", role: "metric", sources: ALL_SOURCES }),
  field({ id: "document.count", label: "Document Count", shortLabel: "Documents", description: "Documents related to the client", group: "Documents", type: "number", role: "metric", sources: ALL_SOURCES }),
  field({ id: "task.count", label: "Task Count", shortLabel: "Tasks", description: "Tasks, reminders, follow-ups, calls, and meetings", group: "Tasks & Activities", type: "number", role: "metric", sources: ALL_SOURCES }),
  field({ id: "task.openCount", label: "Open Task Count", shortLabel: "Open Tasks", description: "Open client work items", group: "Tasks & Activities", type: "number", role: "metric", sources: ALL_SOURCES }),
  field({ id: "task.overdueCount", label: "Overdue Task Count", shortLabel: "Overdue", description: "Open work items past their due date", group: "Tasks & Activities", type: "number", role: "metric", sources: ALL_SOURCES }),
  field({ id: "activity.count", label: "Activity Count", shortLabel: "Activities", description: "Persisted timeline events", group: "Tasks & Activities", type: "number", role: "metric", sources: ALL_SOURCES }),
  field({ id: "contact.count", label: "Related People Count", shortLabel: "People", description: "People linked to this client through ClientContact", group: "People & Contacts", type: "number", role: "metric", sources: ALL_SOURCES }),
  field({ id: "contact.primaryNames", label: "Primary Contact Names", shortLabel: "Primary Contacts", description: "Primary people related to this company", group: "People & Contacts", type: "string-list", role: "dimension", sources: ALL_SOURCES }),
];

const CATEGORY_ROMAN: Record<string, string> = { "1": "I", "2": "II", "3": "III", "4": "IV" };
const TARGET_TYPES = [{ id: "recycling", label: "Recycling" }, { id: "eol", label: "EOL" }] as const;
const TARGET_MEASURES = [
  { id: "target", label: "Target" },
  { id: "achieved", label: "Achieved" },
  { id: "remaining", label: "Remaining" },
] as const;

const TARGET_FIELDS: ReportStudioFieldDefinition[] = ["1", "2", "3", "4"].flatMap((categoryId) => {
  const roman = CATEGORY_ROMAN[categoryId];
  const detailFields = TARGET_TYPES.flatMap((type) => TARGET_MEASURES.map((measure) => field({
    id: `target.cat${categoryId}.${type.id}.${measure.id}`,
    label: `CAT ${roman} ${type.label} ${measure.label}`,
    shortLabel: `CAT ${roman} · ${type.id === "recycling" ? "R" : "EOL"} · ${measure.label}`,
    description: `${measure.label} quantity for CAT ${roman} ${type.label}`,
    group: `CAT ${roman}`,
    type: "quantity",
    role: "metric",
    sources: ALL_SOURCES,
  })));
  const totalFields = TARGET_MEASURES.map((measure) => field({
    id: `target.cat${categoryId}.total.${measure.id}`,
    label: `CAT ${roman} Total ${measure.label}`,
    shortLabel: `CAT ${roman} Total · ${measure.label}`,
    description: `${measure.label} across Recycling and EOL for CAT ${roman}`,
    group: `CAT ${roman}`,
    type: "quantity",
    role: "metric",
    sources: ALL_SOURCES,
  }));
  return [...detailFields, ...totalFields];
});

const OVERALL_TARGET_FIELDS = TARGET_MEASURES.map((measure) => field({
  id: `target.overall.${measure.id}`,
  label: `Overall ${measure.label}`,
  shortLabel: `Overall ${measure.label}`,
  description: `${measure.label} across CAT I–IV and Recycling/EOL`,
  group: "Overall Targets",
  type: "quantity",
  role: "metric",
  sources: ALL_SOURCES,
}));

const RATE_FIELD_SOURCES = [
  { id: "quotation", label: "Accepted Quotation", shortLabel: "Quote", group: "Quotation Rates" },
  { id: "billing", label: "Billing", shortLabel: "Bill", group: "Billing Rates" },
] as const;

const CATEGORY_RATE_FIELDS: ReportStudioFieldDefinition[] = RATE_FIELD_SOURCES.flatMap((source) => (
  ["1", "2", "3", "4"].flatMap((categoryId) => {
    const roman = CATEGORY_ROMAN[categoryId];
    const detailFields = TARGET_TYPES.map((type) => field({
      id: `${source.id}.rate.cat${categoryId}.${type.id}`,
      label: `${source.label} CAT ${roman} ${type.label} Rate`,
      shortLabel: `${source.shortLabel} CAT ${roman} · ${type.id === "recycling" ? "R" : "EOL"} Rate`,
      description: `Exact distinct rate(s) per unit for CAT ${roman} ${type.label} from ${source.id === "quotation" ? "the finalised current revision of linked accepted quotations" : "the created bill's target breakdown"}`,
      group: source.group,
      type: "currency-list",
      role: "dimension",
      sources: ALL_SOURCES,
    }));
    const totalField = field({
      id: `${source.id}.rate.cat${categoryId}.total`,
      label: `${source.label} CAT ${roman} Combined Rate`,
      shortLabel: `${source.shortLabel} CAT ${roman} · Total Rate`,
      description: `Exact distinct rate(s) per unit across Recycling and EOL for CAT ${roman} from ${source.id === "quotation" ? "the finalised current revision of linked accepted quotations" : "the created bill's target breakdown"}`,
      group: source.group,
      type: "currency-list",
      role: "dimension",
      sources: ALL_SOURCES,
    });
    return [...detailFields, totalField];
  })
));

export const REPORT_STUDIO_FIELDS: ReportStudioFieldDefinition[] = [...BASE_FIELDS, ...TARGET_FIELDS, ...OVERALL_TARGET_FIELDS, ...CATEGORY_RATE_FIELDS];
export const REPORT_STUDIO_FIELD_MAP = new Map(REPORT_STUDIO_FIELDS.map((definition) => [definition.id, definition]));

export const REPORT_STUDIO_CUSTOM_FIELD_PREFIX = "client.custom.";

const CUSTOM_FIELD_TYPE_MAP: Record<Exclude<ClientCustomFieldType, "password">, ReportStudioFieldType> = {
  text: "string",
  number: "number",
  date: "date",
  checkbox: "boolean",
  url: "string",
  textarea: "string",
};

export function reportStudioCustomFieldId(key: string) {
  return `${REPORT_STUDIO_CUSTOM_FIELD_PREFIX}${key}`;
}

export function reportStudioCustomFieldKey(fieldId: string) {
  return fieldId.startsWith(REPORT_STUDIO_CUSTOM_FIELD_PREFIX)
    ? fieldId.slice(REPORT_STUDIO_CUSTOM_FIELD_PREFIX.length)
    : null;
}

export function buildReportStudioCustomFields(
  definitions: Array<Pick<ClientCustomFieldDefinition, "key" | "label" | "type" | "active" | "applicableCategories">>,
): ReportStudioFieldDefinition[] {
  return definitions.flatMap((definition) => {
    const id = reportStudioCustomFieldId(String(definition.key || "").trim());
    if (
      definition.active === false ||
      definition.type === "password" ||
      definition.key === "legalName" ||
      !/^[a-zA-Z][a-zA-Z0-9]*$/.test(definition.key) ||
      id.length > 120
    ) return [];

    const type = CUSTOM_FIELD_TYPE_MAP[definition.type];
    return [field({
      id,
      label: definition.label,
      shortLabel: definition.label,
      description: "Custom client field configured in Settings",
      group: "Custom Client Fields",
      type,
      role: definition.type === "number" ? "metric" : "dimension",
      aggregate: definition.type === "number" ? "sum" : "first",
      sources: ALL_SOURCES,
      applicableCategories: definition.applicableCategories || [],
    })];
  });
}

export function reportStudioFieldMap(additionalFields: ReportStudioFieldDefinition[] = []) {
  return new Map([...REPORT_STUDIO_FIELDS, ...additionalFields].map((definition) => [definition.id, definition]));
}

export const REPORT_STUDIO_EXCEL_GROUP_COLORS: Record<string, string> = {
  Client: "#263B5E",
  "Financial Year": "#3F5F85",
  Quotations: "#7357A6",
  "Quotation Rates": "#7357A6",
  "Billing & Payments": "#B66A12",
  "Billing Rates": "#B66A12",
  Compliance: "#087E8B",
  "PWP Credits": "#2E8B68",
  "Credit Transactions": "#087E8B",
  Documents: "#52606D",
  "Tasks & Activities": "#C2413A",
  "People & Contacts": "#7357A6",
  "CAT I": "#2F6FBD",
  "CAT II": "#087E8B",
  "CAT III": "#7357A6",
  "CAT IV": "#B66A12",
  "Overall Targets": "#234F7D",
};

export function reportStudioExcelColor(definition: ReportStudioFieldDefinition, overrides: Record<string, string> = {}) {
  return overrides[definition.id] || REPORT_STUDIO_EXCEL_GROUP_COLORS[definition.group] || "#263B5E";
}

export type ReportStudioFilterValue = string | number | boolean | Array<string | number> | null;
export type ReportStudioFilterClause = {
  id: string;
  kind: "condition";
  field: string;
  operator: ReportStudioOperator;
  value?: ReportStudioFilterValue;
  secondValue?: ReportStudioFilterValue;
};
export type ReportStudioFilterGroup = {
  id: string;
  kind: "group";
  logic: "and" | "or";
  children: Array<ReportStudioFilterClause | ReportStudioFilterGroup>;
};

const filterValueSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.array(z.union([z.string(), z.number().finite()])), z.null()]);
const filterClauseSchema: z.ZodType<ReportStudioFilterClause> = z.object({
  id: z.string().trim().min(1).max(100),
  kind: z.literal("condition"),
  field: z.string().trim().min(1).max(120),
  operator: z.enum(REPORT_STUDIO_OPERATOR_IDS),
  value: filterValueSchema.optional(),
  secondValue: filterValueSchema.optional(),
});
const filterNodeSchema: z.ZodType<ReportStudioFilterClause | ReportStudioFilterGroup> = z.lazy(() => z.union([filterClauseSchema, filterGroupSchema]));
const filterGroupSchema: z.ZodType<ReportStudioFilterGroup> = z.object({
  id: z.string().trim().min(1).max(100),
  kind: z.literal("group"),
  logic: z.enum(["and", "or"]),
  children: z.array(filterNodeSchema).max(30),
});

export const REPORT_STUDIO_ANALYSIS_TRANSFORMS = ["presence", "value", "range", "timePeriod"] as const;
export type ReportStudioAnalysisTransform = (typeof REPORT_STUDIO_ANALYSIS_TRANSFORMS)[number];
export type ReportStudioAnalysisTimePeriod = "month" | "quarter" | "year";

const analysisSchema = z.object({
  field: z.string().trim().min(1).max(120).default("client.gstNumber"),
  transform: z.enum(REPORT_STUDIO_ANALYSIS_TRANSFORMS).default("presence"),
  bucketCount: z.number().int().min(2).max(12).default(5),
  timePeriod: z.enum(["month", "quarter", "year"]).default("month"),
});

export const reportStudioConfigSchema = z.object({
  name: z.string().trim().max(120).default("Untitled report"),
  source: z.enum(REPORT_STUDIO_SOURCE_IDS).default("clients"),
  financialYear: z.string().trim().min(1),
  columns: z.array(z.string().trim().min(1)).min(1).max(120),
  filters: filterGroupSchema,
  search: z.string().trim().max(120).default(""),
  metrics: z.array(z.string().trim().min(1)).max(20).default([]),
  groupBy: z.array(z.string().trim().min(1)).max(2).default([]),
  sort: z.array(z.object({ field: z.string().trim().min(1), direction: z.enum(["asc", "desc"]) })).max(3).default([]),
  businessResultIds: z.array(z.string().trim().min(1).max(120))
    .min(1, "Select at least one Business Result")
    .max(30)
    .refine((ids) => new Set(ids).size === ids.length, "Business Result selections must be unique")
    .nullable()
    .default(null),
  excelColumnColors: z.record(z.string().trim().min(1).max(120), z.string().regex(/^#[0-9a-fA-F]{6}$/)).default({}),
  analysis: analysisSchema.default({ field: "client.gstNumber", transform: "presence", bucketCount: 5, timePeriod: "month" }),
  view: z.enum(["table", "pivot", "chart", "analysis", "relationships"]).default("table"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(10).max(100).default(25),
});
export type ReportStudioConfig = z.infer<typeof reportStudioConfigSchema>;

export type ReportStudioCellValue = string | number | boolean | Array<string | number> | null;
export type ReportStudioResultRow = {
  id: string;
  values: Record<string, ReportStudioCellValue>;
  clientIds: string[];
};
export type ReportStudioResultValue = {
  id: string;
  label: string;
  description: string;
  type: ReportStudioFieldType;
  value: number | string | null;
  group?: string;
};
export type ReportStudioColumnResult = {
  field: string;
  results: ReportStudioResultValue[];
};
export type ReportStudioAnalysisBucketFilter = {
  field: string;
  operator: ReportStudioOperator;
  value?: ReportStudioFilterValue;
  secondValue?: ReportStudioFilterValue;
};
export type ReportStudioAnalysisBucket = {
  id: string;
  label: string;
  value: number;
  filters: ReportStudioAnalysisBucketFilter[];
  tone?: "recorded" | "missing" | "excluded" | "value";
};
export type ReportStudioAnalysisResult = {
  field: ReportStudioFieldDefinition;
  transform: ReportStudioAnalysisTransform;
  chart: "donut" | "bar" | "line";
  total: number;
  applicable: number;
  recorded: number;
  missing: number;
  excluded: number;
  coveragePercent: number;
  buckets: ReportStudioAnalysisBucket[];
};
export type ReportStudioResponse = {
  generatedAt?: string;
  config: ReportStudioConfig;
  columns: ReportStudioFieldDefinition[];
  rows: ReportStudioResultRow[];
  summary: {
    matchedClients: number;
    focusOptions?: Array<{ field: string; operator: "eq" | "gt" | "lt"; value: string | number; label: string; count: number }>;
    metrics: Array<{ field: string; label: string; type: ReportStudioFieldType; value: number }>;
    businessResults: ReportStudioResultValue[];
    businessResultOptions: ReportStudioResultValue[];
    automaticBusinessResultIds: string[];
    relatedBusinessResultIds: string[];
    columnResults: ReportStudioColumnResult[];
    analysis: ReportStudioAnalysisResult;
  };
  pagination: { page: number; pageSize: number; totalRows: number; totalPages: number };
  quality: { messages: string[] };
};

export function fieldsForSource(source: ReportStudioSource, additionalFields: ReportStudioFieldDefinition[] = []) {
  return [...REPORT_STUDIO_FIELDS, ...additionalFields]
    .filter((definition) => !definition.sources || definition.sources.includes(source));
}

export function validateReportStudioConfig(input: unknown, additionalFields: ReportStudioFieldDefinition[] = []): ReportStudioConfig {
  const config = reportStudioConfigSchema.parse(input);
  const allowedFields = new Map(fieldsForSource(config.source, additionalFields).map((definition) => [definition.id, definition]));
  const referenced = [
    ...config.columns,
    ...config.metrics,
    ...config.groupBy,
    ...config.sort.map((entry) => entry.field),
    config.analysis.field,
  ];
  const visitFilters = (group: ReportStudioFilterGroup) => {
    group.children.forEach((child) => {
      if (child.kind === "group") visitFilters(child);
      else {
        const definition = allowedFields.get(child.field);
        if (!definition) throw new Error(`Field is not available for this source: ${child.field}`);
        if (!definition.operators.includes(child.operator)) throw new Error(`Operator is not allowed for ${definition.label}`);
      }
    });
  };
  referenced.forEach((fieldId) => {
    if (!allowedFields.has(fieldId)) throw new Error(`Field is not available for this source: ${fieldId}`);
  });
  Object.keys(config.excelColumnColors).forEach((fieldId) => {
    if (!allowedFields.has(fieldId)) throw new Error(`Excel colour field is not available for this source: ${fieldId}`);
  });
  config.metrics.forEach((fieldId) => {
    if (allowedFields.get(fieldId)?.role !== "metric") throw new Error(`Summary metric must be numeric: ${fieldId}`);
  });
  config.groupBy.forEach((fieldId) => {
    if (allowedFields.get(fieldId)?.role !== "dimension") throw new Error(`Group field must be a dimension: ${fieldId}`);
  });
  const analysisField = allowedFields.get(config.analysis.field);
  if (!analysisField) throw new Error(`Field is not available for this source: ${config.analysis.field}`);
  if (config.analysis.transform === "range" && !["number", "quantity", "currency", "percentage"].includes(analysisField.type)) {
    throw new Error(`Range analysis requires a numeric field: ${analysisField.label}`);
  }
  if (config.analysis.transform === "timePeriod" && analysisField.type !== "date") {
    throw new Error(`Time-period analysis requires a date field: ${analysisField.label}`);
  }
  visitFilters(config.filters);
  return config;
}

export const ACCEPTED_TARGET_DETAIL_COLUMNS = [
  "client.companyName", "client.category", "financialYear.year",
  ...["1", "2", "3", "4"].flatMap((categoryId) => [
    ...TARGET_TYPES.flatMap((type) => TARGET_MEASURES.map((measure) => `target.cat${categoryId}.${type.id}.${measure.id}`)),
    ...TARGET_MEASURES.map((measure) => `target.cat${categoryId}.total.${measure.id}`),
  ]),
  ...TARGET_MEASURES.map((measure) => `target.overall.${measure.id}`),
];

export const ACCEPTED_TARGET_COMPACT_COLUMNS = [
  "client.companyName", "client.category", "target.overall.target",
  "target.overall.achieved", "target.overall.remaining", "target.overall.progress",
];

export function createAcceptedTargetStudioConfig(financialYear: string, detailed = true): ReportStudioConfig {
  return validateReportStudioConfig({
    name: "Accepted Clients — Target Achievement",
    source: "clients",
    financialYear,
    columns: detailed ? ACCEPTED_TARGET_DETAIL_COLUMNS : ACCEPTED_TARGET_COMPACT_COLUMNS,
    filters: {
      id: "root",
      kind: "group",
      logic: "and",
      children: [{ id: "accepted-linked", kind: "condition", field: "quotation.statuses", operator: "contains", value: "Accepted" }],
    },
    metrics: [
      "client.count", "target.overall.target", "target.overall.achieved", "target.overall.remaining",
      ...["1", "2", "3", "4"].flatMap((categoryId) => TARGET_MEASURES.map((measure) => `target.cat${categoryId}.total.${measure.id}`)),
    ],
    groupBy: [],
    sort: [{ field: "target.overall.remaining", direction: "desc" }],
    view: "table",
    page: 1,
    pageSize: 25,
  });
}
