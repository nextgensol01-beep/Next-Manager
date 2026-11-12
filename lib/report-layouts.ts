import { BILLING_ANALYSIS_LEVELS } from "./report-datasets";
import type { ReportStudioFieldDefinition, ReportStudioFieldType, ReportStudioSource } from "./report-studio";

export const DETAIL_MONTHS = ["April", "May", "June", "July", "August", "September", "October", "November", "December", "January", "February", "March"];
export const FINANCE_FIELDS: Record<string, [string, ReportStudioFieldType]> = {
  "finance.billed": ["Full bill gross", "currency"], "finance.billAllocated": ["Full bill allocated payments", "currency"],
  "finance.outstanding": ["Current bill outstanding", "currency"], "finance.cash": ["Recorded direct cash receipts", "currency"],
  "finance.availableAdvance": ["Current available advances", "currency"], "finance.appliedAdvance": ["Advance applied", "currency"],
  "finance.allocated": ["Allocated amount", "currency"], "finance.unallocated": ["Unallocated payment amount", "currency"],
  "finance.billId": ["Allocated bill ID", "string"], "finance.billReference": ["Bill reference", "string"],
  "finance.billFY": ["Bill financial year", "string"], "finance.receiptFY": ["Payment-date financial year", "string"],
  "finance.invoiceDate": ["Invoice date", "date"], "finance.dueDate": ["Due date", "date"],
};

export const REPORT_COMPARISON_SOURCES = new Set<ReportStudioSource>([
  "finance-activity", "payment-register", "advance-register", "invoice-coverage", "invoice-months", "target-breakdown",
  "quotation-register", "quotation-revisions", "quotation-charges", "credit-ledger", "credit-perspectives", "upload-register", "annual-returns", "pibo-targets",
]);

export type ReportLayout = { id: string; label: string; source: ReportStudioSource; groupBy: string[]; columns?: string[] };
const families: ReportStudioSource[][] = [
  BILLING_ANALYSIS_LEVELS.map(level => level.id), ["quotation-register", "quotation-revisions", "quotation-charges"],
  ["invoice-coverage", "invoice-months"], ["pibo-targets", "target-breakdown"], ["credit-ledger", "credit-perspectives"],
];
const entryLabels: Partial<Record<ReportStudioSource, string>> = {
  "billing-companies": "Client-wise", "billing-bills": "Bill-wise", "billing-charges": "Charge-wise",
  "quotation-register": "Quotation entries", "quotation-revisions": "Revision history", "quotation-charges": "Charge-wise",
  "invoice-coverage": "Client coverage", "invoice-months": "Monthly status rows",
  "pibo-targets": "Target summary", "target-breakdown": "Category and obligation rows",
  "credit-ledger": "Transaction-wise", "credit-perspectives": "Client purchases and sales",
};

export function reportDatasetRoot(source: ReportStudioSource) {
  return families.find(group => group.includes(source))?.[0] ?? source;
}

export const REPORT_DATASET_CARD_COPY: Partial<Record<ReportStudioSource, [string, string]>> = {
  "billing-companies": ["Billing", "Bills, charge breakdowns, taxes and outstanding balances"],
  "finance-activity": ["Billing & payments", "Compare billed amounts, recorded direct receipts and current balances"],
  "payment-register": ["Payments", "Received payments, bill allocations and reconciliation"],
  "advance-register": ["Advances", "Current advance balances and recorded applications"],
  "quotation-register": ["Quotations", "Quotation amounts, charges, revisions and billing status"],
  "invoice-coverage": ["Received invoices", "Purchase and sale availability by client and month"],
  "pibo-targets": ["EPR Targets", "Obligations, achievements and pending quantities"],
  "annual-returns": ["Annual Returns", "Filing status and readiness"],
  "upload-register": ["Portal uploads", "Uploaded quantities and invoice counts"],
  "credit-ledger": ["Credit transactions", "Purchases, sales, counterparties, quantities and rates"],
};

export function reportLayouts(source: ReportStudioSource, fields: ReportStudioFieldDefinition[]): ReportLayout[] {
  const family = families.find(group => group.includes(source)) ?? [source];
  const layouts: ReportLayout[] = family.map(member => ({ id: member, label: entryLabels[member] ?? "Source rows", source: member, groupBy: [] }));
  if (family.includes("invoice-coverage")) layouts.push({ id: "invoice-grid", label: "April–March columns", source: "invoice-coverage", groupBy: [],
    columns: ["client.companyName", "financialYear.year", "record.direction", ...DETAIL_MONTHS.map((_, i) => `invoice.month.${i + 1}`)] });
  const monthSource = source === "billing-companies" ? "billing-bills" : source;
  if (fields.some(field => field.id === "record.month") || monthSource.startsWith("billing-") || source === "invoice-coverage") {
    layouts.push({ id: "month", label: "Month-wise", source: source === "invoice-coverage" ? "invoice-months" : monthSource,
      groupBy: [monthSource.startsWith("billing-") ? "bill.month" : "record.month"] });
  }
  const presets = [
    ["client", "Client totals", "client.companyName"], ["year", "Financial-year totals", source === "payment-register" ? "finance.receiptFY" : "financialYear.year"],
    ["state", "State-wise", "client.state"], ["category", "Category-wise", "record.category"],
    ["client-category", "Client category", "client.category"], ["status", "Status-wise", source === "invoice-months" ? "invoice.status" : "record.status"],
    ["filing", "Filing status-wise", "annualReturn.status"], ["direction", "Direction-wise", "record.direction"], ["day", "Day-wise", "record.day"],
    ["allocation", "Bill allocation-wise", "finance.billId"], ["bill-year", "Bill FY totals", "finance.billFY"], ["tracker", "Tracker-wise", "record.reference"],
  ];
  const dimensions = new Set(fields.filter(field => field.role === "dimension").map(field => field.id));
  if (fields.some(field => field.role === "metric")) {
    for (const [id, label, field] of presets) {
      if (dimensions.has(field) && (id !== "tracker" || source === "tracker-entries")) layouts.push({ id, label, source, groupBy: [field] });
    }
  }
  return layouts;
}
