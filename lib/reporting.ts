import { z } from "zod";
import { QUOTATION_STATUSES } from "@/lib/quotationRules";

export const REPORT_VIEW_IDS = [
  "accepted-targets",
  "targets",
  "quotations",
  "credits",
  "billing",
  "compliance",
  "uploads",
  "clients",
] as const;

export type ReportViewId = (typeof REPORT_VIEW_IDS)[number];
export type ReportCreditType = "RECYCLING" | "EOL";
export type ReportRowMode = "client" | "quotation" | "category";
export type ReportPaymentStatus = "all" | "paid" | "partial" | "unpaid" | "no-billing";
export type ReportDateField = "created" | "sent" | "accepted";
export type ReportSortBy =
  | "companyName"
  | "targetTotal"
  | "quotedTotal"
  | "achievedTotal"
  | "remainingTotal"
  | "acceptedValue"
  | "pendingAmount"
  | "achievementPercent";

export const REPORT_VIEW_DEFINITIONS: Array<{
  id: ReportViewId;
  label: string;
  description: string;
}> = [
  { id: "accepted-targets", label: "Accepted Quotations + Targets", description: "Accepted clients with CAT-wise FY targets, client totals, and achievement" },
  { id: "targets", label: "Targets & Achievement", description: "Targets, achieved credits, remaining quantity, and progress" },
  { id: "quotations", label: "Quotations & Acceptance", description: "Quotation pipeline, response status, value, and client conversion" },
  { id: "credits", label: "Credits & Transactions", description: "Generated, transferred, achieved, and remaining credits" },
  { id: "billing", label: "Billing & Collections", description: "Billed value, received payments, and pending collections" },
  { id: "compliance", label: "Compliance", description: "Annual-return and invoice readiness by client" },
  { id: "uploads", label: "Upload Records", description: "CPCB upload quantities and invoice counts" },
  { id: "clients", label: "Client Overview", description: "Cross-functional client and FY overview" },
];

const optionalNumber = z.number().finite().optional();

export const reportQuerySchema = z.object({
  view: z.enum(REPORT_VIEW_IDS).default("accepted-targets"),
  financialYear: z.string().trim().min(1),
  search: z.string().trim().max(160).default(""),
  clientCategories: z.array(z.string().trim().min(1)).max(12).default([]),
  states: z.array(z.string().trim().min(1)).max(80).default([]),
  quotationStatuses: z.array(z.enum(QUOTATION_STATUSES)).max(QUOTATION_STATUSES.length).default([]),
  sentOnly: z.boolean().default(false),
  hasTarget: z.enum(["all", "yes", "no"]).default("all"),
  targetTypes: z.array(z.enum(["RECYCLING", "EOL"])).max(2).default(["RECYCLING", "EOL"]),
  categoryIds: z.array(z.enum(["1", "2", "3", "4"])).max(4).default(["1", "2", "3", "4"]),
  paymentStatus: z.enum(["all", "paid", "partial", "unpaid", "no-billing"]).default("all"),
  annualReturnStatuses: z.array(z.string().trim().min(1)).max(20).default([]),
  dateField: z.enum(["created", "sent", "accepted"]).default("created"),
  dateFrom: z.string().trim().default(""),
  dateTo: z.string().trim().default(""),
  minTarget: optionalNumber,
  maxTarget: optionalNumber,
  minRemaining: optionalNumber,
  maxRemaining: optionalNumber,
  minAchievement: optionalNumber,
  maxAchievement: optionalNumber,
  includeZero: z.boolean().default(true),
  rowMode: z.enum(["client", "quotation", "category"]).default("client"),
  sortBy: z.enum([
    "companyName",
    "targetTotal",
    "quotedTotal",
    "achievedTotal",
    "remainingTotal",
    "acceptedValue",
    "pendingAmount",
    "achievementPercent",
  ]).default("remainingTotal"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(10).max(100).default(25),
  topN: z.number().int().min(5).max(30).default(10),
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;

export const DEFAULT_REPORT_QUERY: ReportQuery = {
  view: "accepted-targets",
  financialYear: "",
  search: "",
  clientCategories: ["Producer", "Importer", "Brand Owner"],
  states: [],
  quotationStatuses: ["Accepted"],
  sentOnly: false,
  hasTarget: "yes",
  targetTypes: ["RECYCLING", "EOL"],
  categoryIds: ["1", "2", "3", "4"],
  paymentStatus: "all",
  annualReturnStatuses: [],
  dateField: "created",
  dateFrom: "",
  dateTo: "",
  includeZero: true,
  rowMode: "client",
  sortBy: "remainingTotal",
  sortDirection: "desc",
  page: 1,
  pageSize: 25,
  topN: 10,
};

export const REPORT_VIEW_DEFAULTS: Record<ReportViewId, Partial<ReportQuery>> = {
  "accepted-targets": {
    clientCategories: ["Producer", "Importer", "Brand Owner"],
    quotationStatuses: ["Accepted"],
    sentOnly: false,
    hasTarget: "yes",
    sortBy: "remainingTotal",
  },
  targets: {
    clientCategories: ["Producer", "Importer", "Brand Owner"],
    quotationStatuses: [],
    sentOnly: false,
    hasTarget: "yes",
    sortBy: "remainingTotal",
  },
  quotations: {
    clientCategories: [],
    quotationStatuses: [],
    sentOnly: false,
    hasTarget: "all",
    sortBy: "acceptedValue",
  },
  credits: {
    clientCategories: [],
    quotationStatuses: [],
    sentOnly: false,
    hasTarget: "all",
    sortBy: "achievedTotal",
  },
  billing: {
    clientCategories: [],
    quotationStatuses: [],
    sentOnly: false,
    hasTarget: "all",
    sortBy: "pendingAmount",
  },
  compliance: {
    clientCategories: [],
    quotationStatuses: [],
    sentOnly: false,
    hasTarget: "all",
    sortBy: "companyName",
    sortDirection: "asc",
  },
  uploads: {
    clientCategories: [],
    quotationStatuses: [],
    sentOnly: false,
    hasTarget: "all",
    sortBy: "companyName",
    sortDirection: "asc",
  },
  clients: {
    clientCategories: [],
    quotationStatuses: [],
    sentOnly: false,
    hasTarget: "all",
    sortBy: "companyName",
    sortDirection: "asc",
  },
};

export type ReportBreakdownRow = {
  categoryId: string;
  categoryLabel: string;
  type: ReportCreditType;
  target: number;
  quoted: number;
  achieved: number;
  remaining: number;
  achievementPercent: number;
};

export type ReportQuotationItem = {
  description: string;
  categoryId: string;
  categoryLabel: string;
  type: ReportCreditType;
  quantity: number;
  rate: number;
  value: number;
  mapped: boolean;
};

export type ReportQuotationRow = {
  id: string;
  quotationNumber: string;
  status: string;
  revisionNumber: number;
  createdAt: string;
  sentAt: string;
  acceptedAt: string;
  grandTotal: number;
  revisionFinalised: boolean;
  items: ReportQuotationItem[];
};

export type ReportBillingRateRow = {
  categoryId: string;
  categoryLabel: string;
  type: ReportCreditType;
  quantity: number;
  rate: number;
};

export type ReportClientRow = {
  clientId: string;
  companyName: string;
  legalName: string;
  clientCategory: string;
  state: string;
  gstNumber: string;
  registrationNumber: string;
  clientCreatedAt: string;
  financialYear: string;
  financialYearRecorded: boolean;
  quotationCount: number;
  sentQuotationCount: number;
  acceptedQuotationCount: number;
  acceptedQuotationValue: number;
  quotationValue: number;
  targetTotal: number;
  targetRecycling: number;
  targetEol: number;
  quotedTotal: number;
  quotedRecycling: number;
  quotedEol: number;
  achievedTotal: number;
  achievedRecycling: number;
  achievedEol: number;
  generatedCredits: number;
  soldCredits: number;
  inboundTransactionCount: number;
  outboundTransactionCount: number;
  remainingCredits: number;
  remainingTotal: number;
  remainingRecycling: number;
  remainingEol: number;
  achievementPercent: number;
  billingTotal: number;
  receivedTotal: number;
  paymentCount: number;
  pendingAmount: number;
  paymentStatus: ReportPaymentStatus;
  billingCreated: boolean;
  billingInvoiceCreated: boolean;
  annualReturnStatus: string;
  invoiceCount: number;
  invoiceSaleMonthsReceived: number;
  invoicePurchaseMonthsReceived: number;
  invoiceCoveragePercent: number;
  uploadQuantity: number;
  uploadInvoiceCount: number;
  uploadRecordCount: number;
  breakdown: ReportBreakdownRow[];
  quotations: ReportQuotationRow[];
  billingTargetBreakdown: ReportBillingRateRow[];
  warnings: string[];
};

export type ReportResponse = {
  query: ReportQuery;
  rows: ReportClientRow[];
  pagination: { page: number; pageSize: number; totalRows: number; totalPages: number };
  summary: {
    matchedClients: number;
    matchingQuotations: number;
    acceptedQuotations: number;
    acceptedQuotationValue: number;
    targetTotal: number;
    quotedTotal: number;
    achievedTotal: number;
    remainingTotal: number;
    generatedCredits: number;
    soldCredits: number;
    remainingCredits: number;
    achievementPercent: number;
    billingTotal: number;
    receivedTotal: number;
    pendingAmount: number;
    annualReturnRecorded: number;
    invoiceRecords: number;
    uploadQuantity: number;
    uploadInvoiceCount: number;
  };
  charts: {
    categoryComparison: Array<{ name: string; categoryId: string; type: ReportCreditType; target: number; quoted: number; achieved: number; remaining: number }>;
    clientComparison: Array<{
      clientId: string;
      name: string;
      target: number;
      quoted: number;
      achieved: number;
      remaining: number;
      generated: number;
      sold: number;
      remainingCredits: number;
      billed: number;
      received: number;
      pending: number;
      uploadQuantity: number;
    }>;
    composition: Array<{ name: string; value: number }>;
    quotationStatuses: Array<{ name: string; value: number }>;
    annualReturnStatuses: Array<{ name: string; value: number }>;
  };
  facets: {
    categories: Array<{ value: string; count: number }>;
    states: Array<{ value: string; count: number }>;
    quotationStatuses: Array<{ value: string; count: number }>;
    annualReturnStatuses: Array<{ value: string; count: number }>;
  };
  quality: { unlinkedQuotations: number; unmappedQuotationItems: number; messages: string[] };
};

export function createReportQuery(financialYear: string, view: ReportViewId = "accepted-targets"): ReportQuery {
  return reportQuerySchema.parse({
    ...DEFAULT_REPORT_QUERY,
    ...REPORT_VIEW_DEFAULTS[view],
    view,
    financialYear,
  });
}

export function categoryLabel(categoryId: string) {
  const labels: Record<string, string> = { "1": "CAT-I", "2": "CAT-II", "3": "CAT-III", "4": "CAT-IV" };
  return labels[categoryId] || "Unmapped";
}
