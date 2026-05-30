import type {
  CalculatedQuotationItem,
  QuotationItemInput,
  QuotationStatus,
} from "@/lib/quotationRules";

export {
  QUOTATION_STATUSES,
  type QuotationItemInput,
  type QuotationStatus,
  type CalculatedQuotationItem as QuotationItem,
} from "@/lib/quotationRules";

type QuotationItem = CalculatedQuotationItem;

export interface QuotationSnapshot {
  clientId?: string;
  clientName: string;
  financialYear: string;
  items: QuotationItem[];
  itemsSubtotal: number;
  itemsGst: number;
  consultationCharges: number;
  consultationGstPercent: number;
  consultationGstAmount: number;
  governmentFees: number;
  grandTotal: number;
  notes: string;
  validUntil?: Date | string | null;
  status: QuotationStatus;
  revisionNumber: number;
  quotationNumber: string;
}

export interface QuotationPayload {
  clientId?: string;
  clientName: string;
  financialYear: string;
  items: QuotationItemInput[];
  consultationCharges: number;
  consultationGstPercent: number;
  governmentFees: number;
  notes?: string;
  validUntil?: string | Date | null;
}

export interface QuotationListQuery {
  financialYear?: string;
  status?: QuotationStatus | "all";
  search?: string;
  page: number;
  limit: number;
  latestOnly: boolean;
}
