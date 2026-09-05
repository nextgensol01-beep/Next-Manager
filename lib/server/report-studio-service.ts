import {
  REPORT_STUDIO_FIELD_MAP,
  validateReportStudioConfig,
  type ReportStudioCellValue,
  type ReportStudioConfig,
  type ReportStudioFieldDefinition,
  type ReportStudioFilterClause,
  type ReportStudioFilterGroup,
  type ReportStudioResponse,
  type ReportStudioResultValue,
  type ReportStudioResultRow,
} from "@/lib/report-studio";
import {
  annualReturnPrerequisitesComplete,
  annualReturnWorkflowProgressPercent,
} from "@/lib/annualReturnStatus";
import { createReportQuery, type ReportClientRow } from "@/lib/reporting";
import { buildReport, type ReportDataSection } from "@/lib/server/reporting-service";
import DocumentModel from "@/models/Document";
import ClientWorkItem from "@/models/ClientWorkItem";
import ActivityEvent from "@/models/ActivityEvent";
import ClientContact from "@/models/ClientContact";
import Person from "@/models/Person";

type StudioBaseRow = {
  id: string;
  clientId: string;
  values: Record<string, ReportStudioCellValue>;
};

type RelatedStats = {
  documentCount: number;
  taskCount: number;
  openTaskCount: number;
  overdueTaskCount: number;
  activityCount: number;
  contactCount: number;
  primaryContactNames: string[];
};

const EMPTY_RELATED_STATS: RelatedStats = {
  documentCount: 0,
  taskCount: 0,
  openTaskCount: 0,
  overdueTaskCount: 0,
  activityCount: 0,
  contactCount: 0,
  primaryContactNames: [],
};

const PIBO_CATEGORIES = new Set(["Producer", "Importer", "Brand Owner"]);

function targetValue(row: ReportClientRow, fieldId: string): number | null {
  if (!PIBO_CATEGORIES.has(row.clientCategory)) return null;
  const overall = fieldId.match(/^target\.overall\.(target|achieved|remaining)$/);
  if (overall) {
    if (!row.financialYearRecorded && overall[1] !== "achieved") return null;
    if (overall[1] === "target") return row.targetTotal;
    if (overall[1] === "achieved") return row.achievedTotal;
    return row.remainingTotal;
  }

  const match = fieldId.match(/^target\.cat([1-4])\.(recycling|eol|total)\.(target|achieved|remaining)$/);
  if (!match) return null;
  const [, categoryId, rawType, measure] = match;
  if (!row.financialYearRecorded && measure !== "achieved") return null;
  const entries = row.breakdown.filter((entry) => (
    entry.categoryId === categoryId && (rawType === "total" || entry.type === rawType.toUpperCase())
  ));
  return entries.reduce((sum, entry) => sum + entry[measure as "target" | "achieved" | "remaining"], 0);
}

function distinctRates(entries: Array<{ quantity: number; rate: number }>): number[] | null {
  const rates = entries
    .filter((entry) => Number.isFinite(entry.quantity) && entry.quantity > 0 && Number.isFinite(entry.rate))
    .map((entry) => entry.rate);
  const distinct = Array.from(new Set(rates));
  return distinct.length > 0 ? distinct : null;
}

function categoryRateValue(row: ReportClientRow, fieldId: string): number[] | null {
  const match = fieldId.match(/^(quotation|billing)\.rate\.cat([1-4])\.(recycling|eol|total)$/);
  if (!match) return null;
  const [, source, categoryId, rawType] = match;
  const matchesDimension = (entry: { categoryId: string; type: string }) => (
    entry.categoryId === categoryId && (rawType === "total" || entry.type === rawType.toUpperCase())
  );

  if (source === "quotation") {
    const items = row.quotations
      .filter((quotation) => quotation.status === "Accepted" && quotation.revisionFinalised)
      .flatMap((quotation) => quotation.items)
      .filter((item) => item.mapped && matchesDimension(item));
    return distinctRates(items);
  }

  if (!row.billingCreated || !row.billingInvoiceCreated) return null;
  return distinctRates(row.billingTargetBreakdown.filter(matchesDimension));
}

function registeredInFinancialYear(createdAt: string, financialYear: string) {
  const startYear = Number(financialYear.match(/^(\d{4})-/)?.[1]);
  const date = new Date(createdAt);
  if (!Number.isFinite(startYear) || Number.isNaN(date.getTime())) return false;
  const start = Date.UTC(startYear, 3, 1);
  const end = Date.UTC(startYear + 1, 2, 31, 23, 59, 59, 999);
  return date.getTime() >= start && date.getTime() <= end;
}

function resolveValue(row: ReportClientRow, fieldId: string, related: RelatedStats): ReportStudioCellValue {
  if (fieldId.startsWith("target.")) return targetValue(row, fieldId);
  if (fieldId.startsWith("quotation.rate.") || fieldId.startsWith("billing.rate.")) return categoryRateValue(row, fieldId);
  switch (fieldId) {
    case "client.companyName": return row.companyName;
    case "client.legalName": return row.legalName || null;
    case "client.clientId": return row.clientId;
    case "client.category": return row.clientCategory;
    case "client.state": return row.state;
    case "client.gstNumber": return row.gstNumber || null;
    case "client.registrationNumber": return row.registrationNumber || null;
    case "client.registrationDate": return row.clientCreatedAt || null;
    case "client.registeredThisFY": return registeredInFinancialYear(row.clientCreatedAt, row.financialYear);
    case "client.count": return 1;
    case "financialYear.year": return row.financialYear;
    case "financialYear.hasRecord": return row.financialYearRecorded;
    case "quotation.statuses": return Array.from(new Set(row.quotations.map((quotation) => quotation.status).filter(Boolean)));
    case "quotation.acceptedCount": return row.acceptedQuotationCount;
    case "quotation.count": return row.quotationCount;
    case "quotation.acceptedValue": return row.acceptedQuotationValue;
    case "quotation.numbers": return row.quotations.map((quotation) => quotation.quotationNumber).filter(Boolean);
    case "billing.total": return row.billingCreated ? row.billingTotal : null;
    case "payment.received": return row.billingCreated || row.paymentCount > 0 ? row.receivedTotal : null;
    case "billing.outstanding": return row.billingCreated ? row.pendingAmount : null;
    case "billing.invoiceCreated": return row.billingCreated ? row.billingInvoiceCreated : null;
    case "payment.status": return row.paymentStatus;
    case "payment.count": return row.paymentCount;
    case "annualReturn.status": return row.annualReturnStatus;
    case "annualReturn.completionPercent": return annualReturnWorkflowProgressPercent({
      status: row.annualReturnStatus,
      clientCategory: row.clientCategory,
      invoiceCoveragePercent: row.invoiceCoveragePercent,
      hasUpload: row.uploadRecordCount > 0,
      uploadRecordCount: row.uploadRecordCount,
      hasBilling: row.billingCreated,
      hasAcceptedQuotation: row.acceptedQuotationCount > 0,
      hasSentQuotation: row.sentQuotationCount > 0,
      linkedQuotationCount: row.quotationCount,
    });
    case "invoice.recordCount": return row.invoiceCount;
    case "invoice.saleMonthsReceived": return row.invoiceCount > 0 ? row.invoiceSaleMonthsReceived : null;
    case "invoice.purchaseMonthsReceived": return row.invoiceCount > 0 ? row.invoicePurchaseMonthsReceived : null;
    case "invoice.coveragePercent": return row.invoiceCount > 0 ? row.invoiceCoveragePercent : null;
    case "upload.quantity": return row.uploadRecordCount > 0 ? row.uploadQuantity : null;
    case "upload.recordCount": return row.uploadRecordCount;
    case "pwp.generated": return row.clientCategory === "PWP" && row.financialYearRecorded ? row.generatedCredits : null;
    case "pwp.sold": return row.clientCategory === "PWP" ? row.soldCredits : null;
    case "pwp.remaining": return row.clientCategory === "PWP" && row.financialYearRecorded ? row.remainingCredits : null;
    case "transaction.inboundCount": return row.inboundTransactionCount;
    case "transaction.outboundCount": return row.outboundTransactionCount;
    case "document.count": return related.documentCount;
    case "task.count": return related.taskCount;
    case "task.openCount": return related.openTaskCount;
    case "task.overdueCount": return related.overdueTaskCount;
    case "activity.count": return related.activityCount;
    case "contact.count": return related.contactCount;
    case "contact.primaryNames": return related.primaryContactNames;
    default: return null;
  }
}

function isEmpty(value: ReportStudioCellValue) {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0);
}

function valueList(value: unknown): Array<string | number> {
  if (Array.isArray(value)) return value.filter((entry): entry is string | number => typeof entry === "string" || typeof entry === "number");
  if (typeof value === "string" || typeof value === "number") return [value];
  return [];
}

function comparable(value: ReportStudioCellValue) {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const numeric = Number(value);
    return value.trim() !== "" && Number.isFinite(numeric) ? numeric : value.toLowerCase();
  }
  return null;
}

function equalValue(actual: ReportStudioCellValue, expected: unknown) {
  if (Array.isArray(actual)) return actual.some((entry) => String(entry).toLowerCase() === String(expected ?? "").toLowerCase());
  if (typeof actual === "boolean") return actual === expected || String(actual) === String(expected);
  if (typeof actual === "number") return actual === Number(expected);
  return String(actual ?? "").toLowerCase() === String(expected ?? "").toLowerCase();
}

function matchesCondition(values: Record<string, ReportStudioCellValue>, condition: ReportStudioFilterClause) {
  const actual = values[condition.field] ?? null;
  const expected = condition.value;
  switch (condition.operator) {
    case "empty": return isEmpty(actual);
    case "not_empty": return !isEmpty(actual);
    case "eq": return equalValue(actual, expected);
    case "neq": return !equalValue(actual, expected);
    case "contains": {
      if (Array.isArray(actual)) return actual.some((entry) => String(entry).toLowerCase().includes(String(expected ?? "").toLowerCase()));
      return String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
    }
    case "not_contains": {
      if (Array.isArray(actual)) return actual.every((entry) => !String(entry).toLowerCase().includes(String(expected ?? "").toLowerCase()));
      return !String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
    }
    case "in": {
      const allowed = valueList(expected).map((entry) => String(entry).toLowerCase());
      return Array.isArray(actual)
        ? actual.some((entry) => allowed.includes(String(entry).toLowerCase()))
        : allowed.includes(String(actual ?? "").toLowerCase());
    }
    case "not_in": {
      const blocked = valueList(expected).map((entry) => String(entry).toLowerCase());
      return Array.isArray(actual)
        ? actual.every((entry) => !blocked.includes(String(entry).toLowerCase()))
        : !blocked.includes(String(actual ?? "").toLowerCase());
    }
    case "between": {
      const current = comparable(actual);
      const lower = comparable(condition.value as ReportStudioCellValue);
      const upper = comparable(condition.secondValue as ReportStudioCellValue);
      return current != null && lower != null && upper != null && current >= lower && current <= upper;
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte":
    case "before":
    case "after": {
      const current = condition.operator === "before" || condition.operator === "after"
        ? Date.parse(String(actual ?? ""))
        : Number(actual);
      const compareTo = condition.operator === "before" || condition.operator === "after"
        ? Date.parse(String(expected ?? ""))
        : Number(expected);
      if (!Number.isFinite(current) || !Number.isFinite(compareTo)) return false;
      if (condition.operator === "gt" || condition.operator === "after") return current > compareTo;
      if (condition.operator === "gte") return current >= compareTo;
      if (condition.operator === "lt" || condition.operator === "before") return current < compareTo;
      return current <= compareTo;
    }
    default: return false;
  }
}

function matchesFilterGroup(values: Record<string, ReportStudioCellValue>, group: ReportStudioFilterGroup): boolean {
  if (group.children.length === 0) return true;
  const results = group.children.map((child) => (
    child.kind === "group" ? matchesFilterGroup(values, child) : matchesCondition(values, child)
  ));
  return group.logic === "and" ? results.every(Boolean) : results.some(Boolean);
}

function sourceMatches(row: ReportClientRow, config: ReportStudioConfig, related: RelatedStats) {
  if (config.source === "financial-years") return row.financialYearRecorded;
  if (config.source === "pibo-targets") return row.financialYearRecorded && PIBO_CATEGORIES.has(row.clientCategory);
  if (config.source === "pwp-credits") return row.financialYearRecorded && row.clientCategory === "PWP";
  if (config.source === "annual-returns") return row.annualReturnStatus !== "Not recorded";
  if (config.source === "invoice-tracking") return row.invoiceCount > 0;
  if (config.source === "quotations") return row.quotationCount > 0;
  if (config.source === "billing") return row.billingCreated;
  if (config.source === "payments") return row.paymentCount > 0;
  if (config.source === "cpcb-uploads") return row.uploadRecordCount > 0;
  if (config.source === "credit-transactions") return row.inboundTransactionCount + row.outboundTransactionCount > 0;
  if (config.source === "documents") return related.documentCount > 0;
  if (config.source === "tasks") return related.taskCount > 0;
  if (config.source === "activities") return related.activityCount > 0;
  if (config.source === "contacts") return related.contactCount > 0;
  return true;
}

function aggregateMetric(rows: StudioBaseRow[], definition: ReportStudioFieldDefinition) {
  const values = rows.map((row) => row.values[definition.id]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (definition.aggregate === "average") return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  if (definition.aggregate === "count-distinct") return new Set(values).size;
  return values.reduce((sum, value) => sum + value, 0);
}

const BUSINESS_RESULT_FIELD_DEPENDENCIES: Record<string, string[]> = {
  "accepted-clients": ["quotation.acceptedCount"],
  "overall-target": ["target.overall.target"],
  "overall-achieved": ["target.overall.achieved"],
  "overall-remaining": ["target.overall.remaining"],
  "overall-completion": ["target.overall.target", "target.overall.achieved"],
  "outstanding-fees": ["billing.outstanding"],
  "no-documents": ["document.count"],
  "overdue-followups": ["task.overdueCount"],
  "no-activity": ["activity.count"],
  "target-total": ["target.overall.target"],
  "target-achieved": ["target.overall.achieved"],
  "target-remaining": ["target.overall.remaining"],
  "target-completion": ["target.overall.target", "target.overall.achieved"],
  "credits-generated": ["pwp.generated"],
  "credits-sold": ["pwp.sold"],
  "credits-available": ["pwp.remaining"],
  "credit-utilisation": ["pwp.generated", "pwp.sold"],
  "linked-quotations": ["quotation.count"],
  "accepted-quotations": ["quotation.acceptedCount"],
  "accepted-value": ["quotation.acceptedValue"],
  "accepted-not-billed": ["quotation.acceptedCount", "billing.invoiceCreated"],
  "accepted-payment-pending": ["quotation.acceptedCount", "payment.status"],
  "total-billed": ["billing.total"],
  "total-received": ["payment.received"],
  "total-outstanding": ["billing.outstanding"],
  "fully-paid": ["payment.status"],
  "partially-paid": ["payment.status"],
  unpaid: ["payment.status"],
  "ar-completed": ["annualReturn.status"],
  "ar-verified": ["annualReturn.status"],
  "ar-pending": ["annualReturn.status"],
  "ar-completion": ["annualReturn.status"],
  "ar-progress": ["annualReturn.completionPercent"],
  "ar-not-required": ["annualReturn.status"],
  "invoices-incomplete": ["invoice.coveragePercent"],
  "target-still-remaining": ["target.overall.remaining"],
  "ar-ready": ["client.category", "invoice.coveragePercent", "upload.recordCount", "billing.total", "quotation.acceptedCount"],
  "sale-months": ["invoice.saleMonthsReceived"],
  "purchase-months": ["invoice.purchaseMonthsReceived"],
  "missing-months": ["invoice.saleMonthsReceived", "invoice.purchaseMonthsReceived"],
  "invoice-coverage": ["invoice.saleMonthsReceived", "invoice.purchaseMonthsReceived"],
  "invoice-complete": ["invoice.coveragePercent"],
  "upload-records": ["upload.recordCount"],
  "uploaded-quantity": ["upload.quantity"],
  "achieved-not-uploaded": ["target.overall.achieved", "upload.quantity"],
  "inbound-transactions": ["transaction.inboundCount"],
  "outbound-transactions": ["transaction.outboundCount"],
  "available-credits": ["pwp.remaining"],
  "related-documents": ["document.count"],
  "all-tasks": ["task.count"],
  "open-tasks": ["task.openCount"],
  "overdue-tasks": ["task.overdueCount"],
  "clients-overdue": ["task.overdueCount"],
  "recorded-activities": ["activity.count"],
  "related-people": ["contact.count"],
};

type BusinessResultDomain = "clients" | "quotations" | "targets" | "billing" | "annual-return" | "invoice" | "upload" | "pwp" | "transactions" | "documents" | "tasks" | "activities" | "contacts";

const BUSINESS_RESULT_DOMAINS: Array<{ id: BusinessResultDomain; label: string; resultIds: string[] }> = [
  { id: "clients", label: "Clients", resultIds: ["matched-clients"] },
  { id: "quotations", label: "Quotations", resultIds: ["accepted-clients", "accepted-value", "accepted-quotations", "linked-quotations", "accepted-not-billed", "accepted-payment-pending"] },
  { id: "targets", label: "Targets", resultIds: ["overall-target", "overall-achieved", "overall-remaining", "overall-completion", "target-total", "target-achieved", "target-remaining", "target-completion"] },
  { id: "billing", label: "Billing & Payments", resultIds: ["total-billed", "total-received", "total-outstanding", "outstanding-fees", "fully-paid", "partially-paid", "unpaid"] },
  { id: "annual-return", label: "Annual Return", resultIds: ["ar-completed", "ar-verified", "ar-pending", "ar-completion", "ar-progress", "ar-not-required", "ar-ready", "invoices-incomplete", "target-still-remaining"] },
  { id: "invoice", label: "Invoice Coverage", resultIds: ["invoice-coverage", "missing-months", "sale-months", "purchase-months", "invoice-complete"] },
  { id: "upload", label: "CPCB Uploads", resultIds: ["uploaded-quantity", "upload-records", "achieved-not-uploaded"] },
  { id: "pwp", label: "PWP Credits", resultIds: ["credits-generated", "credits-sold", "credits-available", "credit-utilisation", "available-credits"] },
  { id: "transactions", label: "Credit Transactions", resultIds: ["inbound-transactions", "outbound-transactions"] },
  { id: "documents", label: "Documents", resultIds: ["related-documents", "no-documents"] },
  { id: "tasks", label: "Tasks", resultIds: ["all-tasks", "open-tasks", "overdue-tasks", "clients-overdue", "overdue-followups"] },
  { id: "activities", label: "Activities", resultIds: ["recorded-activities", "no-activity"] },
  { id: "contacts", label: "People & Contacts", resultIds: ["related-people"] },
];

const BUSINESS_RESULT_GROUP_BY_ID = new Map(BUSINESS_RESULT_DOMAINS.flatMap((domain) => domain.resultIds.map((resultId) => [resultId, domain.label] as const)));

function domainForField(fieldId: string): BusinessResultDomain | null {
  if (fieldId.startsWith("client.")) return "clients";
  if (fieldId.startsWith("quotation.")) return "quotations";
  if (fieldId.startsWith("target.")) return "targets";
  if (fieldId.startsWith("billing.") || fieldId.startsWith("payment.")) return "billing";
  if (fieldId.startsWith("annualReturn.")) return "annual-return";
  if (fieldId.startsWith("invoice.")) return "invoice";
  if (fieldId.startsWith("upload.")) return "upload";
  if (fieldId.startsWith("pwp.")) return "pwp";
  if (fieldId.startsWith("transaction.")) return "transactions";
  if (fieldId.startsWith("document.")) return "documents";
  if (fieldId.startsWith("task.")) return "tasks";
  if (fieldId.startsWith("activity.")) return "activities";
  if (fieldId.startsWith("contact.")) return "contacts";
  return null;
}

const SOURCE_RESULT_DOMAIN: Partial<Record<ReportStudioConfig["source"], BusinessResultDomain>> = {
  clients: "clients",
  "financial-years": "targets",
  "pibo-targets": "targets",
  "pwp-credits": "pwp",
  quotations: "quotations",
  billing: "billing",
  payments: "billing",
  "annual-returns": "annual-return",
  "invoice-tracking": "invoice",
  "cpcb-uploads": "upload",
  "credit-transactions": "transactions",
  documents: "documents",
  tasks: "tasks",
  activities: "activities",
  contacts: "contacts",
};

function contextualBusinessResultIds(config: ReportStudioConfig, options: ReportStudioResultValue[]) {
  const activeDomains: BusinessResultDomain[] = [];
  const addDomain = (domain: BusinessResultDomain | null | undefined) => {
    if (domain && !activeDomains.includes(domain)) activeDomains.push(domain);
  };
  addDomain(SOURCE_RESULT_DOMAIN[config.source]);
  const formationFields = [...config.columns, ...config.groupBy, ...config.metrics];
  const visitFilters = (group: ReportStudioFilterGroup) => group.children.forEach((child) => {
    if (child.kind === "group") visitFilters(child);
    else formationFields.push(child.field);
  });
  visitFilters(config.filters);
  formationFields.forEach((fieldId) => addDomain(domainForField(fieldId)));

  const available = new Set(options.map((option) => option.id));
  const activeDomainSet = new Set(activeDomains);
  const isFullyRelated = (resultId: string) => (BUSINESS_RESULT_FIELD_DEPENDENCIES[resultId] || []).every((fieldId) => {
    const dependencyDomain = domainForField(fieldId);
    return dependencyDomain === null || dependencyDomain === "clients" || activeDomainSet.has(dependencyDomain);
  });
  const queues = activeDomains.map((domainId) => (
    BUSINESS_RESULT_DOMAINS.find((domain) => domain.id === domainId)?.resultIds.filter((id) => available.has(id) && isFullyRelated(id)) || []
  ));
  const relatedResultIds = queues.flat();
  const selected: string[] = [];
  while (selected.length < 6 && queues.some((queue) => queue.length > 0)) {
    queues.forEach((queue) => {
      const next = queue.shift();
      if (next && selected.length < 6 && !selected.includes(next)) selected.push(next);
    });
  }
  const fallback = options.slice(0, 1).map((option) => option.id);
  return {
    automaticResultIds: selected.length > 0 ? selected : fallback,
    relatedResultIds: relatedResultIds.length > 0 ? relatedResultIds : fallback,
  };
}

function addBusinessResult(target: ReportStudioResultValue[], id: string, label: string, description: string, type: ReportStudioResultValue["type"], value: number) {
  target.push({ id, label, description, type, value: Number.isFinite(value) ? value : 0, group: BUSINESS_RESULT_GROUP_BY_ID.get(id) || "Other" });
}

function buildBusinessResults(rows: StudioBaseRow[], source: ReportStudioConfig["source"]): ReportStudioResultValue[] {
  const results: ReportStudioResultValue[] = [];
  const number = (row: StudioBaseRow, field: string) => typeof row.values[field] === "number" ? row.values[field] as number : 0;
  const sum = (field: string) => rows.reduce((total, row) => total + number(row, field), 0);
  const count = (predicate: (row: StudioBaseRow) => boolean) => rows.reduce((total, row) => total + (predicate(row) ? 1 : 0), 0);
  const percent = (numerator: number, denominator: number) => denominator > 0 ? (numerator / denominator) * 100 : 0;
  const addCount = (id: string, label: string, description: string, predicate: (row: StudioBaseRow) => boolean) => addBusinessResult(results, id, label, description, "number", count(predicate));
  const addSum = (id: string, label: string, description: string, field: string, type: "number" | "quantity" | "currency" = "number") => addBusinessResult(results, id, label, description, type, sum(field));

  addBusinessResult(results, "matched-clients", "Matching Clients", "Distinct clients matching the current Report Studio filters", "number", rows.length);

  if (source === "clients" || ["financial-years", "pibo-targets"].includes(source)) {
    const target = sum("target.overall.target");
    const achieved = sum("target.overall.achieved");
    if (source === "clients") {
      addBusinessResult(results, "overall-target", "Overall Target", "CAT I–IV Recycling and EOL target for matching clients", "quantity", target);
      addBusinessResult(results, "overall-achieved", "Overall Achieved", "Target quantity achieved by matching clients", "quantity", achieved);
      addBusinessResult(results, "overall-remaining", "Overall Remaining", "Target quantity still remaining for matching clients", "quantity", sum("target.overall.remaining"));
      addBusinessResult(results, "overall-completion", "Target Completion", "Overall achieved quantity divided by overall target for matching clients", "percentage", percent(achieved, target));
    } else {
      addBusinessResult(results, "target-total", "Total Target", "CAT I–IV target across matching clients", "quantity", target);
      addBusinessResult(results, "target-achieved", "Total Achieved", "Achieved target across matching clients", "quantity", achieved);
      addBusinessResult(results, "target-remaining", "Target Remaining", "Target less achieved across matching clients", "quantity", sum("target.overall.remaining"));
      addBusinessResult(results, "target-completion", "Target Completion", "Total achieved divided by total target", "percentage", percent(achieved, target));
    }
  }

  if (source === "clients" || source === "pwp-credits") {
    const generated = sum("pwp.generated");
    const sold = sum("pwp.sold");
    addBusinessResult(results, "credits-generated", "Credits Generated", "Credits generated by matching PWP clients", "quantity", generated);
    addBusinessResult(results, "credits-sold", "Credits Sold", "Credits transferred out by matching PWP clients", "quantity", sold);
    addBusinessResult(results, "credits-available", "Credits Available", "Generated credits less sold credits", "quantity", sum("pwp.remaining"));
    addBusinessResult(results, "credit-utilisation", "Credit Utilisation", "Credits sold divided by credits generated", "percentage", percent(sold, generated));
  }

  if (source === "clients" || source === "quotations") {
    addCount("accepted-clients", "Accepted Quotation Clients", "Matching clients with at least one linked accepted quotation", (row) => number(row, "quotation.acceptedCount") > 0);
    addSum("linked-quotations", "Linked Quotations", "All quotations linked to matching clients in the selected FY", "quotation.count");
    addSum("accepted-quotations", "Accepted Quotations", "Linked quotations currently accepted", "quotation.acceptedCount");
    addSum("accepted-value", "Accepted Value", "Value of accepted current quotation revisions", "quotation.acceptedValue", "currency");
    addCount("accepted-not-billed", "Accepted Without Billing", "Clients with an accepted quotation but no billing invoice created", (row) => number(row, "quotation.acceptedCount") > 0 && row.values["billing.invoiceCreated"] !== true);
    addCount("accepted-payment-pending", "Accepted With Payment Pending", "Accepted-quotation clients whose payment status is unpaid or partial", (row) => number(row, "quotation.acceptedCount") > 0 && ["unpaid", "partial"].includes(String(row.values["payment.status"] || "")));
  }

  if (source === "clients" || ["billing", "payments"].includes(source)) {
    addSum("total-billed", "Total Billed", "Billing total across matching clients", "billing.total", "currency");
    addSum("total-received", "Total Received", "Payments received across matching clients", "payment.received", "currency");
    addSum("total-outstanding", "Total Outstanding", "Billing total less received payments", "billing.outstanding", "currency");
    addCount("fully-paid", "Fully Paid Clients", "Matching clients with paid status", (row) => row.values["payment.status"] === "paid");
    addCount("partially-paid", "Partially Paid Clients", "Matching clients with partial payment status", (row) => row.values["payment.status"] === "partial");
    addCount("unpaid", "Unpaid Clients", "Matching clients with unpaid status", (row) => row.values["payment.status"] === "unpaid");
    if (source === "clients") addSum("outstanding-fees", "Outstanding Fees", "Billing amount less received payments for matching clients", "billing.outstanding", "currency");
  }

  if (source === "clients" || source === "annual-returns") {
    const status = (row: StudioBaseRow) => String(row.values["annualReturn.status"] || "");
    const applicable = count((row) => !["", "Not recorded", "Not Required This FY"].includes(status(row)));
    const completed = count((row) => ["Filed", "Verified"].includes(status(row)));
    const verified = count((row) => status(row) === "Verified");
    const notRequired = count((row) => status(row) === "Not Required This FY");
    const progressValues = rows
      .map((row) => row.values["annualReturn.completionPercent"])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const averageProgress = progressValues.length > 0
      ? progressValues.reduce((total, value) => total + value, 0) / progressValues.length
      : 0;
    addBusinessResult(results, "ar-completed", "AR Filed", "Applicable clients whose Annual Return is Filed or Verified", "number", completed);
    addBusinessResult(results, "ar-verified", "AR Verified", "Applicable clients whose Annual Return verification is complete", "number", verified);
    addBusinessResult(results, "ar-pending", "AR Pending", "Applicable clients whose Annual Return is not yet Filed", "number", Math.max(0, applicable - completed));
    addBusinessResult(results, "ar-completion", "AR Filing Rate", "Filed or Verified applicable clients divided by applicable clients", "percentage", percent(completed, applicable));
    addBusinessResult(results, "ar-progress", "Average AR Workflow Progress", "Average progress across applicable clients using invoice, upload, billing, quotation, filing, and verification checkpoints", "percentage", averageProgress);
    addBusinessResult(results, "ar-not-required", "AR Not Required", "Clients marked Not Required This FY and excluded from progress rates", "number", notRequired);
    addCount("invoices-incomplete", "Invoices Incomplete", "Annual Return clients with invoice coverage below 100%", (row) => number(row, "invoice.coveragePercent") < 100);
    addCount("target-still-remaining", "Clients With Target Remaining", "Annual Return clients whose overall target remains above zero", (row) => number(row, "target.overall.remaining") > 0);
    addCount("ar-ready", "AR Ready Clients", "Clients meeting the website prerequisites: complete invoice coverage, CPCB upload, billing, and an accepted quotation where required", (row) => annualReturnPrerequisitesComplete({
      clientCategory: String(row.values["client.category"] || ""),
      invoiceCoveragePercent: number(row, "invoice.coveragePercent"),
      hasUpload: number(row, "upload.recordCount") > 0,
      hasBilling: typeof row.values["billing.total"] === "number",
      hasAcceptedQuotation: number(row, "quotation.acceptedCount") > 0,
    }));
  }

  if (source === "clients" || source === "invoice-tracking") {
    const coveredMonths = sum("invoice.saleMonthsReceived") + sum("invoice.purchaseMonthsReceived");
    const expectedMonths = rows.length * 24;
    addSum("sale-months", "Sale Months Received", "Covered sale-invoice months for matching clients", "invoice.saleMonthsReceived");
    addSum("purchase-months", "Purchase Months Received", "Covered purchase-invoice months for matching clients", "invoice.purchaseMonthsReceived");
    addBusinessResult(results, "missing-months", "Missing Invoice Months", "Missing sale and purchase months out of 24 expected slots per client", "number", Math.max(0, expectedMonths - coveredMonths));
    addBusinessResult(results, "invoice-coverage", "Invoice Coverage", "Covered sale and purchase months divided by expected months", "percentage", percent(coveredMonths, expectedMonths));
    addCount("invoice-complete", "Invoice-Complete Clients", "Clients with all expected sale and purchase months", (row) => number(row, "invoice.coveragePercent") >= 100);
  }

  if (source === "clients" || source === "cpcb-uploads") {
    const uploaded = sum("upload.quantity");
    const achieved = sum("target.overall.achieved");
    addSum("upload-records", "CPCB Upload Records", "CPCB upload entries for matching clients", "upload.recordCount");
    addBusinessResult(results, "uploaded-quantity", "Uploaded Quantity", "Total quantity recorded in CPCB uploads", "quantity", uploaded);
    addBusinessResult(results, "achieved-not-uploaded", "Achieved Not Yet Uploaded", "Positive difference between achieved target and CPCB uploaded quantity", "quantity", Math.max(0, achieved - uploaded));
  }

  if (source === "clients" || source === "credit-transactions") {
    addSum("inbound-transactions", "Inbound Transactions", "Credit transactions received by matching clients", "transaction.inboundCount");
    addSum("outbound-transactions", "Outbound Transactions", "Credit transactions sold by matching clients", "transaction.outboundCount");
    addSum("available-credits", "Available Credits", "Generated credits less credits sold", "pwp.remaining", "quantity");
  }

  if (source === "clients" || source === "documents") {
    addSum("related-documents", "Related Documents", "Document records related to matching clients", "document.count");
    if (source === "clients") addCount("no-documents", "Clients Without Documents", "Matching clients with no related document records", (row) => number(row, "document.count") === 0);
  }
  if (source === "clients" || source === "tasks") {
    addSum("all-tasks", "All Tasks", "Tasks and follow-ups for matching clients", "task.count");
    addSum("open-tasks", "Open Tasks", "Open work items for matching clients", "task.openCount");
    addSum("overdue-tasks", "Overdue Tasks", "Open work items past their due date", "task.overdueCount");
    addCount("clients-overdue", "Clients Requiring Follow-up", "Clients with at least one overdue task", (row) => number(row, "task.overdueCount") > 0);
    if (source === "clients") addCount("overdue-followups", "Clients With Overdue Tasks", "Matching clients with at least one overdue open task", (row) => number(row, "task.overdueCount") > 0);
  }
  if (source === "clients" || source === "activities") {
    addSum("recorded-activities", "Recorded Activities", "Persisted activity events for matching clients", "activity.count");
    if (source === "clients") addCount("no-activity", "Clients Without Activity", "Matching clients with no persisted activity events", (row) => number(row, "activity.count") === 0);
  }
  if (source === "clients" || source === "contacts") addSum("related-people", "Related People", "People linked to matching clients", "contact.count");

  return results;
}

function buildColumnResults(rows: StudioBaseRow[], definitions: ReportStudioFieldDefinition[]) {
  return definitions.map((definition) => {
    const values = rows.map((row) => row.values[definition.id]);
    const present = values.filter((value) => value != null && (!Array.isArray(value) || value.length > 0));
    const numeric = present.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const results: ReportStudioResultValue[] = [];
    const add = (id: string, label: string, description: string, type: ReportStudioResultValue["type"], value: number | string | null) => results.push({ id, label, description, type, value });
    add("count", "Recorded", "Matching client rows with a recorded value", "number", present.length);
    add("missing", "No Record", "Matching client rows without a recorded value", "number", values.length - present.length);
    if (numeric.length > 0) {
      const sum = numeric.reduce((total, value) => total + value, 0);
      if (definition.type !== "percentage") add("sum", "Total", `Total ${definition.label.toLowerCase()} across all matching clients`, definition.type, sum);
      add("average", "Average", `Average ${definition.label.toLowerCase()} across recorded matching clients`, definition.type, sum / numeric.length);
      add("minimum", "Minimum", `Lowest recorded ${definition.label.toLowerCase()}`, definition.type, Math.min(...numeric));
      add("maximum", "Maximum", `Highest recorded ${definition.label.toLowerCase()}`, definition.type, Math.max(...numeric));
      add("non-zero", "Non-zero Clients", `Matching clients whose ${definition.label.toLowerCase()} is not zero`, "number", numeric.filter((value) => value !== 0).length);
    } else if (definition.type === "date") {
      const dated = present.map((value) => String(value)).filter((value) => Number.isFinite(Date.parse(value))).sort((left, right) => Date.parse(left) - Date.parse(right));
      if (dated.length > 0) {
        add("earliest", "Earliest", `Earliest recorded ${definition.label.toLowerCase()}`, "date", dated[0]);
        add("latest", "Latest", `Latest recorded ${definition.label.toLowerCase()}`, "date", dated[dated.length - 1]);
      }
    } else {
      const distinct = new Set(present.flatMap((value) => Array.isArray(value) ? value : [String(value)])).size;
      add("distinct", "Distinct Values", `Distinct recorded ${definition.label.toLowerCase()} values`, "number", distinct);
    }
    return { field: definition.id, results };
  });
}

function groupRows(rows: StudioBaseRow[], config: ReportStudioConfig): ReportStudioResultRow[] {
  if (config.groupBy.length === 0) {
    return rows.map((row) => ({ id: row.id, values: row.values, clientIds: [row.clientId] }));
  }
  const groups = new Map<string, StudioBaseRow[]>();
  rows.forEach((row) => {
    const key = config.groupBy.map((fieldId) => {
      const value = row.values[fieldId];
      return Array.isArray(value) ? value.join(", ") : String(value ?? "No value");
    }).join("\u001f");
    groups.set(key, [...(groups.get(key) || []), row]);
  });
  return Array.from(groups, ([key, members], index) => {
    const values: Record<string, ReportStudioCellValue> = {};
    config.groupBy.forEach((fieldId) => { values[fieldId] = members[0]?.values[fieldId] ?? null; });
    config.metrics.forEach((fieldId) => {
      const definition = REPORT_STUDIO_FIELD_MAP.get(fieldId);
      if (definition) values[fieldId] = aggregateMetric(members, definition);
    });
    return { id: `group-${index}-${key}`, values, clientIds: members.map((member) => member.clientId) };
  });
}

function compareValues(left: ReportStudioCellValue, right: ReportStudioCellValue) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  const leftText = Array.isArray(left) ? left.join(", ") : String(left);
  const rightText = Array.isArray(right) ? right.join(", ") : String(right);
  return leftText.localeCompare(rightText, "en", { numeric: true, sensitivity: "base" });
}

function sortRows(rows: ReportStudioResultRow[], config: ReportStudioConfig) {
  const sort = config.sort.length > 0 ? config.sort : [{ field: config.groupBy[0] || config.columns[0], direction: "asc" as const }];
  return [...rows].sort((left, right) => {
    for (const item of sort) {
      const comparison = compareValues(left.values[item.field] ?? null, right.values[item.field] ?? null);
      if (comparison !== 0) return item.direction === "asc" ? comparison : -comparison;
    }
    return 0;
  });
}

function referencedFields(config: ReportStudioConfig) {
  const fields = new Set<string>([
    ...config.columns,
    ...config.metrics,
    ...config.groupBy,
    ...config.sort.map((entry) => entry.field),
  ]);
  const visit = (group: ReportStudioFilterGroup) => group.children.forEach((child) => {
    if (child.kind === "group") visit(child);
    else fields.add(child.field);
  });
  visit(config.filters);
  return fields;
}

function requiredSections(config: ReportStudioConfig, fields: Set<string>) {
  const sections = new Set<ReportDataSection>();
  const has = (prefix: string) => Array.from(fields).some((field) => field.startsWith(prefix));
  if (has("financialYear.") || has("target.") || has("pwp.")) sections.add("financial-years");
  if (has("target.") || has("pwp.") || has("transaction.") || config.source === "credit-transactions") sections.add("transactions");
  if (has("quotation.") || config.source === "quotations") sections.add("quotations");
  if (has("billing.") || has("payment.status") || config.source === "billing") sections.add("billing");
  if (has("payment.") || has("billing.outstanding") || config.source === "payments") sections.add("payments");
  if (has("invoice.") || config.source === "invoice-tracking") sections.add("invoices");
  if (has("annualReturn.") || config.source === "annual-returns") sections.add("annual-returns");
  if (has("upload.") || config.source === "cpcb-uploads") sections.add("uploads");
  if (fields.has("annualReturn.completionPercent")) {
    sections.add("invoices");
    sections.add("uploads");
    sections.add("billing");
    sections.add("quotations");
  }
  if (["financial-years", "pibo-targets", "pwp-credits"].includes(config.source)) sections.add("financial-years");
  return sections;
}

function countByClient<T extends { clientId?: unknown }>(records: T[]) {
  const map = new Map<string, number>();
  records.forEach((record) => {
    const clientId = String(record.clientId || "");
    if (clientId) map.set(clientId, (map.get(clientId) || 0) + 1);
  });
  return map;
}

async function loadRelatedStats(clientIds: string[], financialYear: string, fields: Set<string>, source: ReportStudioConfig["source"]) {
  const needsDocuments = fields.has("document.count") || source === "documents";
  const needsTasks = Array.from(fields).some((field) => field.startsWith("task.")) || source === "tasks";
  const needsActivities = fields.has("activity.count") || source === "activities";
  const needsContacts = Array.from(fields).some((field) => field.startsWith("contact.")) || source === "contacts";
  const [documents, tasks, activities, contacts] = await Promise.all([
    needsDocuments ? DocumentModel.find({ clientId: { $in: clientIds } }).select("clientId").lean() as Promise<Array<{ clientId?: unknown }>> : Promise.resolve([]),
    needsTasks ? ClientWorkItem.find({ clientId: { $in: clientIds }, $or: [{ financialYear }, { financialYear: "" }, { financialYear: { $exists: false } }] }).select("clientId status dueAt").lean() as Promise<Array<{ clientId?: unknown; status?: unknown; dueAt?: unknown }>> : Promise.resolve([]),
    needsActivities ? ActivityEvent.find({ clientId: { $in: clientIds }, $or: [{ financialYear }, { financialYear: "" }, { financialYear: { $exists: false } }] }).select("clientId").lean() as Promise<Array<{ clientId?: unknown }>> : Promise.resolve([]),
    needsContacts ? ClientContact.find({ clientId: { $in: clientIds } }).select("clientId personId isPrimaryContact").lean() as Promise<Array<{ clientId?: unknown; personId?: unknown; isPrimaryContact?: unknown }>> : Promise.resolve([]),
  ]);
  const documentCounts = countByClient(documents);
  const taskCounts = countByClient(tasks);
  const activityCounts = countByClient(activities);
  const contactCounts = countByClient(contacts);
  const openTaskCounts = new Map<string, number>();
  const overdueTaskCounts = new Map<string, number>();
  const now = Date.now();
  tasks.forEach((task) => {
    const clientId = String(task.clientId || "");
    if (!clientId || task.status !== "open") return;
    openTaskCounts.set(clientId, (openTaskCounts.get(clientId) || 0) + 1);
    const dueAt = task.dueAt ? new Date(task.dueAt as string | Date).getTime() : NaN;
    if (Number.isFinite(dueAt) && dueAt < now) overdueTaskCounts.set(clientId, (overdueTaskCounts.get(clientId) || 0) + 1);
  });

  const primaryContacts = contacts.filter((contact) => Boolean(contact.isPrimaryContact));
  const personIds = Array.from(new Set(primaryContacts.map((contact) => String(contact.personId || "")).filter(Boolean)));
  const people = personIds.length > 0 ? await Person.find({ _id: { $in: personIds } }).select("name").lean() as Array<{ _id?: unknown; name?: unknown }> : [];
  const personNames = new Map(people.map((person) => [String(person._id || ""), String(person.name || "")]));
  const primaryNames = new Map<string, string[]>();
  primaryContacts.forEach((contact) => {
    const clientId = String(contact.clientId || "");
    const name = personNames.get(String(contact.personId || ""));
    if (clientId && name) primaryNames.set(clientId, [...(primaryNames.get(clientId) || []), name]);
  });

  return new Map(clientIds.map((clientId) => [clientId, {
    documentCount: documentCounts.get(clientId) || 0,
    taskCount: taskCounts.get(clientId) || 0,
    openTaskCount: openTaskCounts.get(clientId) || 0,
    overdueTaskCount: overdueTaskCounts.get(clientId) || 0,
    activityCount: activityCounts.get(clientId) || 0,
    contactCount: contactCounts.get(clientId) || 0,
    primaryContactNames: primaryNames.get(clientId) || [],
  } satisfies RelatedStats]));
}

export async function executeReportStudio(rawConfig: unknown, options: { exportAll?: boolean } = {}): Promise<ReportStudioResponse> {
  const config = validateReportStudioConfig(rawConfig);
  const businessResultOptions = buildBusinessResults([], config.source);
  const availableBusinessResultIds = new Set(businessResultOptions.map((result) => result.id));
  const { automaticResultIds, relatedResultIds } = contextualBusinessResultIds(config, businessResultOptions);
  const validManualResultIds = config.businessResultIds?.filter((id) => availableBusinessResultIds.has(id)) || [];
  const selectedBusinessResultIds = config.businessResultIds === null
    ? automaticResultIds
    : validManualResultIds.length > 0 ? validManualResultIds : automaticResultIds;
  const referenced = referencedFields(config);
  selectedBusinessResultIds.forEach((resultId) => {
    (BUSINESS_RESULT_FIELD_DEPENDENCIES[resultId] || []).forEach((fieldId) => referenced.add(fieldId));
  });
  const sections = requiredSections(config, referenced);
  const baseQuery = createReportQuery(config.financialYear, "clients");
  const report = await buildReport({
    ...baseQuery,
    clientCategories: [],
    quotationStatuses: [],
    sentOnly: false,
    hasTarget: "all",
    includeZero: true,
    rowMode: "client",
    sortBy: "companyName",
    sortDirection: "asc",
    page: 1,
    pageSize: 100,
  }, { exportAll: true, sections });

  const sourceFieldIds = new Set(Array.from(referenced).filter((fieldId) => REPORT_STUDIO_FIELD_MAP.has(fieldId)));
  const relatedStats = await loadRelatedStats(report.rows.map((row) => row.clientId), config.financialYear, referenced, config.source);
  const baseRows: StudioBaseRow[] = report.rows
    .filter((row) => sourceMatches(row, config, relatedStats.get(row.clientId) || EMPTY_RELATED_STATS))
    .map((row) => {
      const related = relatedStats.get(row.clientId) || EMPTY_RELATED_STATS;
      const values = Object.fromEntries(Array.from(sourceFieldIds, (fieldId) => [fieldId, resolveValue(row, fieldId, related)]));
      return { id: row.clientId, clientId: row.clientId, values };
    })
    .filter((row) => matchesFilterGroup(row.values, config.filters));

  const summaryMetrics = config.metrics.map((fieldId) => REPORT_STUDIO_FIELD_MAP.get(fieldId)).filter((definition): definition is ReportStudioFieldDefinition => Boolean(definition));
  const groupedRows = sortRows(groupRows(baseRows, config), config);
  const responseColumnIds = config.groupBy.length > 0 ? [...config.groupBy, ...config.metrics] : config.columns;
  const columns = responseColumnIds.map((fieldId) => REPORT_STUDIO_FIELD_MAP.get(fieldId)).filter((definition): definition is ReportStudioFieldDefinition => Boolean(definition));
  const totalRows = groupedRows.length;
  const pageRows = options.exportAll || config.view === "pivot"
    ? groupedRows
    : groupedRows.slice((config.page - 1) * config.pageSize, config.page * config.pageSize);

  const calculatedBusinessResults = new Map(buildBusinessResults(baseRows, config.source).map((result) => [result.id, result]));
  const businessResults = selectedBusinessResultIds
    .map((resultId) => calculatedBusinessResults.get(resultId))
    .filter((result): result is ReportStudioResultValue => Boolean(result));

  return {
    config,
    columns,
    rows: pageRows,
    summary: {
      matchedClients: baseRows.length,
      metrics: summaryMetrics.map((definition) => ({
        field: definition.id,
        label: definition.label,
        type: definition.type,
        value: aggregateMetric(baseRows, definition),
      })),
      businessResults,
      businessResultOptions,
      automaticBusinessResultIds: automaticResultIds,
      relatedBusinessResultIds: relatedResultIds,
      columnResults: buildColumnResults(baseRows, columns),
    },
    pagination: {
      page: config.page,
      pageSize: config.pageSize,
      totalRows,
      totalPages: Math.max(1, Math.ceil(totalRows / config.pageSize)),
    },
    quality: { messages: report.quality.messages },
  };
}
