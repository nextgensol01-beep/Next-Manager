import type { ClientTrackerCategory, ClientTrackerDetailKey, TrackerDataLinkDisplay, TrackerDataLinkSource, TrackerField, TrackerFieldType } from "@/lib/clientTrackers";
import { normalizeTrackerOptionColors } from "@/lib/tracker-option-colors";

export type TrackerBuilderClient = {
  clientId: string;
  companyName: string;
  category: string;
  state?: string;
};
/** Stable identity belongs to the draft, never the API field definition. */
export type TrackerDraftField = TrackerField & { uiId: string };
export type TrackerCreateDraft = {
  name: string;
  description: string;
  financialYear: string;
  includeStatus: boolean;
  emailEnabled: boolean;
  fields: TrackerDraftField[];
  clientColumns: ClientTrackerDetailKey[];
  scope: "all" | "categories" | "selected";
  membershipMode: "snapshot" | "categorySync";
  selectedCategories: ClientTrackerCategory[];
  selected: string[];
};
export type TrackerCreateErrors = Partial<Record<"name" | "financialYear" | "audience", string>>;

let draftSequence = 0;
export function draftField(field: TrackerField = blankField()): TrackerDraftField {
  return {
    ...field,
    ...(field.dataLink ? { dataLink: { ...field.dataLink } } : {}),
    ...(field.options ? { options: [...field.options] } : {}),
    ...(["select", "multiSelect", "tags"].includes(field.type) ? { optionColors: normalizeTrackerOptionColors(field.options, field.optionColors) } : {}),
    uiId: `tracker-column-${++draftSequence}`,
  };
}
export function emptyTrackerDraft(): TrackerCreateDraft {
  return { name: "", description: "", financialYear: "", includeStatus: true,
    emailEnabled: false, fields: [], clientColumns: ["state"], scope: "all",
    membershipMode: "snapshot", selectedCategories: [], selected: [] };
}
export function trackerNeedsFinancialYear(fields: TrackerField[]): boolean {
  return fields.some(field => field.dataLink?.source === "purchaseUploads" || field.dataLink?.source === "saleUploads");
}
export function trackerCreateErrors(form: TrackerCreateDraft): TrackerCreateErrors {
  const errors: TrackerCreateErrors = {};
  // Keep the original order and the original creation requirements.
  if (!form.name.trim()) errors.name = "Give this tracker a name.";
  if (trackerNeedsFinancialYear(form.fields) && !form.financialYear) errors.financialYear = "Choose a financial year for CPCB upload data.";
  if (form.scope === "categories" && !form.selectedCategories.length) errors.audience = "Choose at least one client category.";
  if (form.scope === "selected" && !form.selected.length) errors.audience = "Select at least one client.";
  return errors;
}
export function trackerCreatePayload(form: TrackerCreateDraft) {
  return { ...form, fields: form.fields.map(({ uiId, ...field }) => { void uiId; return field; }),
    clientMembershipMode: form.scope === "categories" ? form.membershipMode : "snapshot",
    clientIds: form.scope === "selected" ? form.selected : [],
    clientCategories: form.scope === "categories" ? form.selectedCategories : [] };
}
/** Starter replacement compares the current column values, ignoring draft identities. */
export function trackerColumnSignature(fields: TrackerDraftField[], includeStatus: boolean): string {
  return JSON.stringify({ includeStatus, fields: fields.map(({ uiId, ...field }) => { void uiId; return field; }) });
}
export function trackerAudience(clients: TrackerBuilderClient[], form: Pick<TrackerCreateDraft, "scope" | "selected" | "selectedCategories">) {
  if (form.scope === "all") return clients;
  const values = new Set(form.scope === "selected" ? form.selected : form.selectedCategories);
  return clients.filter(client => values.has(form.scope === "selected" ? client.clientId : client.category));
}
export function liveSourcePatch(source: TrackerDataLinkSource): Partial<TrackerField> {
  const display = LIVE_DATA_DISPLAYS[source][0].value;
  return { dataLink: { source, display }, computed: undefined, type: liveFieldType(display), options: undefined, optionInput: undefined };
}
export function manualTypePatch(type: TrackerFieldType): Partial<TrackerField> {
  const hasOptions = ["select", "multiSelect", "tags"].includes(type);
  return { type, options: hasOptions ? ["Option 1", "Option 2"] : undefined, optionInput: hasOptions ? "Option 1, Option 2" : undefined,
    optionColors: hasOptions ? normalizeTrackerOptionColors(["Option 1", "Option 2"]) : undefined };
}
export function computedSourceFields(fields: TrackerField[], current: TrackerField) {
  return fields.filter(field => field.key && field.key !== current.key && !field.computed);
}
export function computedFieldPatch(fields: TrackerField[], current: TrackerField): Partial<TrackerField> {
  const sources = computedSourceFields(fields, current);
  return { dataLink: undefined, computed: { kind: "percentage", primaryFieldKey: sources[0]?.key || "", secondaryFieldKey: sources[1]?.key || sources[0]?.key || "" }, type: "number", options: undefined, optionInput: undefined };
}
export const FIELD_TYPES: Array<{ id: TrackerFieldType; label: string }> = [
  { id: "toggle", label: "Yes / No toggle" },
  { id: "select", label: "Dropdown" },
  { id: "text", label: "Short text" },
  { id: "longText", label: "Long text" },
  { id: "multiSelect", label: "Multi-select" },
  { id: "tags", label: "Tags" },
  { id: "number", label: "Number" },
  { id: "percentage", label: "Percentage" },
  { id: "quantity", label: "Quantity" },
  { id: "currency", label: "Currency" },
  { id: "progress", label: "Progress" },
  { id: "date", label: "Date" },
];
export const LIVE_DATA_SOURCES: Array<{
  value: TrackerDataLinkSource;
  label: string;
}> = [
  { value: "purchaseInvoices", label: "Purchase invoice collection" },
  { value: "saleInvoices", label: "Sale invoice collection" },
  { value: "annualReturn", label: "Annual return" },
  { value: "purchaseUploads", label: "CPCB purchase uploads" },
  { value: "saleUploads", label: "CPCB sale uploads" },
];
export const LIVE_DATA_DISPLAYS: Record<
  TrackerDataLinkSource,
  Array<{ value: TrackerDataLinkDisplay; label: string }>
> = {
  purchaseInvoices: [
    { value: "coverageStatus", label: "Coverage status" },
    { value: "monthsCovered", label: "Months covered" },
    { value: "requiredMonths", label: "Required months" },
    { value: "missingMonths", label: "Missing months" },
    { value: "yesNo", label: "Received / covered (legacy)" },
    { value: "count", label: "Number of records" },
    { value: "status", label: "Latest status" },
    { value: "latestDate", label: "Latest period end" },
  ],
  saleInvoices: [
    { value: "coverageStatus", label: "Coverage status" },
    { value: "monthsCovered", label: "Months covered" },
    { value: "requiredMonths", label: "Required months" },
    { value: "missingMonths", label: "Missing months" },
    { value: "yesNo", label: "Received / covered (legacy)" },
    { value: "count", label: "Number of records" },
    { value: "status", label: "Latest status" },
    { value: "latestDate", label: "Latest period end" },
  ],
  annualReturn: [
    { value: "yesNo", label: "Filed / verified" },
    { value: "status", label: "Current status" },
    { value: "latestDate", label: "Filing date" },
  ],
  purchaseUploads: [
    { value: "uploadStatus", label: "Upload status" },
    { value: "yesNo", label: "Has purchase upload" },
    { value: "quantity", label: "Total quantity (MT)" },
    { value: "invoiceCount", label: "Invoices uploaded" },
    { value: "cat1", label: "CAT-I quantity (MT)" },
    { value: "cat2", label: "CAT-II quantity (MT)" },
    { value: "cat3", label: "CAT-III quantity (MT)" },
    { value: "cat4", label: "CAT-IV quantity (MT)" },
    { value: "count", label: "Upload records" },
  ],
  saleUploads: [
    { value: "uploadStatus", label: "Upload status" },
    { value: "yesNo", label: "Has sale upload" },
    { value: "quantity", label: "Total quantity (MT)" },
    { value: "invoiceCount", label: "Invoices uploaded" },
    { value: "cat1", label: "CAT-I quantity (MT)" },
    { value: "cat2", label: "CAT-II quantity (MT)" },
    { value: "cat3", label: "CAT-III quantity (MT)" },
    { value: "cat4", label: "CAT-IV quantity (MT)" },
    { value: "count", label: "Upload records" },
  ],
  uploadedData: [
    { value: "yesNo", label: "Has uploaded data" },
    { value: "quantity", label: "Invoice quantity (MT)" },
    { value: "invoiceCount", label: "Number of invoices" },
    { value: "count", label: "Upload records" },
  ],
};
export function liveFieldType(display: TrackerDataLinkDisplay): TrackerFieldType {
  if (display === "yesNo") return "toggle";
  if (display === "latestDate") return "date";
  if (
    [
      "count",
      "quantity",
      "invoiceCount",
      "cat1",
      "cat2",
      "cat3",
      "cat4",
      "requiredMonths",
    ].includes(display)
  )
    return "number";
  return "text";
}

export function blankField(): TrackerField {
  return { key: "", label: "", type: "toggle" };
}
export const TRACKER_STARTERS: Array<{
  id: string;
  label: string;
  fields: TrackerField[];
}> = [
  { id: "blank", label: "Blank tracker", fields: [] },
  {
    id: "follow-up",
    label: "Client follow-up worklist",
    fields: [
      { key: "assignee", label: "Assignee", type: "text" },
      { key: "dueDate", label: "Due date", type: "date" },
      {
        key: "priority",
        label: "Priority",
        type: "select",
        options: ["Low", "Medium", "High"],
        optionInput: "Low, Medium, High",
      },
      { key: "nextAction", label: "Next action", type: "text" },
    ],
  },
  {
    id: "cpcb",
    label: "CPCB invoice and upload follow-up",
    fields: [
      {
        key: "purchaseInvoiceCollection",
        label: "Purchase invoices received",
        type: "toggle",
        dataLink: { source: "purchaseInvoices", display: "yesNo" },
      },
      {
        key: "saleInvoiceCollection",
        label: "Sale invoices received",
        type: "toggle",
        dataLink: { source: "saleInvoices", display: "yesNo" },
      },
      {
        key: "purchaseUpload",
        label: "Purchase uploaded on CPCB",
        type: "toggle",
        dataLink: { source: "purchaseUploads", display: "yesNo" },
      },
      {
        key: "saleUpload",
        label: "Sale uploaded on CPCB",
        type: "toggle",
        dataLink: { source: "saleUploads", display: "yesNo" },
      },
      {
        key: "purchaseInvoiceCount",
        label: "Purchase invoices uploaded",
        type: "number",
        dataLink: { source: "purchaseUploads", display: "invoiceCount" },
      },
      {
        key: "saleInvoiceCount",
        label: "Sale invoices uploaded",
        type: "number",
        dataLink: { source: "saleUploads", display: "invoiceCount" },
      },
      {
        key: "purchaseMt",
        label: "Purchase plastic uploaded (MT)",
        type: "number",
        dataLink: { source: "purchaseUploads", display: "quantity" },
      },
      {
        key: "saleMt",
        label: "Sale plastic uploaded (MT)",
        type: "number",
        dataLink: { source: "saleUploads", display: "quantity" },
      },
      { key: "nextAction", label: "Next action", type: "text" },
      { key: "dueDate", label: "Due date", type: "date" },
    ],
  },
];

