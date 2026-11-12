export const BILLING_ANALYSIS_LEVELS = [
  { id: "billing-companies", label: "Company-wise", description: "One row per company and financial year" },
  { id: "billing-bills", label: "Bill-wise", description: "One row per bill with selected charges and whole-bill balances" },
  { id: "billing-charges", label: "Charge-wise", description: "One row per charge or verified EPR target line" },
] as const;
export type BillingAnalysisSource = typeof BILLING_ANALYSIS_LEVELS[number]["id"];
export const isBillingAnalysisSource = (source: string): source is BillingAnalysisSource => BILLING_ANALYSIS_LEVELS.some(level => level.id === source);

export const REPORT_DETAIL_SOURCES = ["quotation-register", "quotation-revisions", "quotation-charges", "bill-register", "payment-register", "advance-register", "finance-activity", "credit-ledger", "credit-perspectives", "invoice-months", "invoice-coverage", "target-breakdown", "upload-register", "tracker-entries", "campaigns", "email-activity", "document-register", "work-items", "billing-companies", "billing-bills", "billing-charges"] as const;
export type ReportDetailSource = typeof REPORT_DETAIL_SOURCES[number];

export const REPORT_DETAIL_DATASETS = {
  "quotation-register": { label: "Quotations", grain: "One row per quotation", date: "Quotation created date", columns: ["record.reference", "client.companyName", "record.status", "record.date", "record.revision", "record.amount", "record.billingState"] },
  "quotation-revisions": { label: "Quotation revision history", grain: "One row per quotation revision", date: "Revision created date", columns: ["record.reference", "client.companyName", "record.revision", "record.status", "record.date", "record.amount"] },
  "quotation-charges": { label: "Quotation charges", grain: "One row per charge in the current quotation revision", date: "Quotation created date", columns: ["client.companyName", "record.reference", "record.date", "record.status", "record.billingState", "record.chargeType", "record.description", "record.quantity", "record.rate", "record.taxable", "record.gstRate", "record.gst", "record.amount"] },
  "bill-register": { label: "Bills and balances", grain: "One row per bill", date: "Bill date", columns: ["record.reference", "client.companyName", "record.status", "record.date", "record.amount", "record.paid", "record.outstanding"] },
  "billing-companies": { label: "Billing", grain: BILLING_ANALYSIS_LEVELS[0].description, date: "Filter underlying bill, invoice or due dates", columns: ["client.companyName", "financialYear.year", "bill.count", "charge.selectedGross", "bill.gross", "bill.paid", "bill.outstanding"] },
  "billing-bills": { label: "Billing · Bills", grain: BILLING_ANALYSIS_LEVELS[1].description, date: "Bill, invoice and due dates", columns: ["client.companyName", "financialYear.year", "bill.reference", "bill.type", "bill.date", "charge.selectedGross", "bill.gross", "bill.paid", "bill.outstanding", "bill.paymentStatus"] },
  "billing-charges": { label: "Billing · Charges", grain: BILLING_ANALYSIS_LEVELS[2].description, date: "Parent bill, invoice and due dates", columns: ["client.companyName", "financialYear.year", "bill.reference", "bill.type", "charge.description", "charge.kind", "charge.classification", "charge.targetCategory", "charge.creditType", "charge.gross"] },
  "payment-register": { label: "Payment records and reconciliation", grain: "One row per payment record", date: "Payment date", columns: ["client.companyName", "record.reference", "record.date", "record.status", "record.amount", "finance.cash", "finance.allocated", "finance.unallocated", "finance.billReference", "record.mode", "record.allocation", "record.reviewReason"] },
  "advance-register": { label: "Advances", grain: "One row per current advance balance or application", date: "Recorded payment date", columns: ["client.companyName", "financialYear.year", "record.date", "record.status", "record.reference", "finance.availableAdvance", "finance.appliedAdvance", "finance.billReference"] },
  "finance-activity": { label: "Billing & payments", grain: "One row per bill, direct receipt or available advance", date: "Bill date or receipt date", columns: ["client.companyName", "financialYear.year", "record.date", "record.status", "finance.billed", "finance.billAllocated", "finance.outstanding", "finance.cash", "finance.availableAdvance"] },
  "credit-ledger": { label: "Credit movements", grain: "One row per credit transaction", date: "Transaction date", columns: ["record.seller", "record.buyer", "record.status", "record.date", "record.quantity", "record.amount", "record.rates"] },
  "credit-perspectives": { label: "Credit purchases and sales", grain: "One row per recorded client, direction and category in a credit transaction", date: "Transaction date", columns: ["client.companyName", "record.direction", "record.category", "record.date", "record.status", "record.seller", "record.buyer", "record.rate", "credit.purchaseQuantity", "credit.saleQuantity", "credit.purchaseValue", "credit.saleValue"] },
  "invoice-months": { label: "Sale and purchase invoice months", grain: "One row per client, invoice direction and month", date: "Coverage month", columns: ["client.companyName", "record.direction", "record.date", "invoice.status"] },
  "invoice-coverage": { label: "Received invoices", grain: "One row per client and invoice direction", date: "April–March coverage", columns: ["client.companyName", "financialYear.year", "record.direction", "invoice.received", "invoice.covered", "invoice.missing", "invoice.partial", "invoice.nil", "invoice.unknown", "invoice.complete"] },
  "target-breakdown": { label: "EPR target breakdown", grain: "One row per client, category and obligation type", date: "Financial year", columns: ["client.companyName", "financialYear.year", "record.category", "record.direction", "coverage.target", "coverage.achieved", "coverage.covered", "coverage.pending", "coverage.excess", "coverage.percent", "record.status"] },
  "upload-register": { label: "CPCB purchase and sale uploads", grain: "One row per upload record", date: "Record created date", columns: ["client.companyName", "record.direction", "record.date", "record.quantity", "record.invoiceCount"] },
  "tracker-entries": { label: "Tracker participation", grain: "One row per tracker and client", date: "Entry last updated", columns: ["client.companyName", "record.reference", "record.status", "record.date"] },
  campaigns: { label: "Email campaigns", grain: "One row per campaign", date: "Campaign created date", columns: ["record.reference", "record.status", "record.date", "record.mode", "record.quantity", "record.sent", "record.drafts", "record.failed"] },
  "email-activity": { label: "Email activity metadata", grain: "One row per email log", date: "Recorded send or draft date", columns: ["client.companyName", "record.mode", "record.status", "record.date"] },
  "document-register": { label: "Document inventory", grain: "One row per document", date: "Document upload date", columns: ["client.companyName", "record.reference", "record.status", "record.date", "record.mode"] },
  "work-items": { label: "Tasks and follow-ups", grain: "One row per work item", date: "Due date", columns: ["client.companyName", "record.reference", "record.status", "record.date", "record.mode"] },
} satisfies Record<ReportDetailSource, { label: string; grain: string; date: string; columns: string[] }>;

export const REPORT_BUILDER_CATEGORIES = [
  { id: "clients", title: "Clients", description: "Company records, registrations, contacts and custom fields", sources: ["client-directory", "clients", "contacts"] },
  { id: "compliance", title: "Compliance", description: "Financial years, target coverage, filing and invoice records", sources: ["financial-years", "pibo-targets", "target-breakdown", "annual-returns", "invoice-coverage", "invoice-months", "invoice-tracking", "upload-register", "cpcb-uploads"] },
  { id: "finance", title: "Finance", description: "Quotations, bills, payments and outstanding amounts", sources: ["billing-companies", "finance-activity", "payment-register", "advance-register", "quotation-register", "quotation-revisions", "quotation-charges", "billing", "quotations", "payments", "bill-register", "billing-bills", "billing-charges"] },
  { id: "credits", title: "EPR Credits", description: "Generated credits, purchases, sales, quantities and rates", sources: ["pwp-credits", "credit-ledger", "credit-perspectives", "credit-transactions"] },
  { id: "operations", title: "Operations", description: "Trackers, documents, tasks and email campaigns", sources: ["tracker-entries", "document-register", "work-items", "campaigns", "email-activity", "documents", "tasks", "activities"] },
  { id: "advanced", title: "Advanced / Cross-category", description: "Combine compatible measures in one client and financial year report", sources: ["clients"] },
] as const;

export function isReportDetailSource(source: string): source is ReportDetailSource {
  return Object.hasOwn(REPORT_DETAIL_DATASETS, source);
}

export function isRestrictedReportSource(source: unknown) {
  return source === "campaigns" || source === "email-activity";
}
