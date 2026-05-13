export interface ClientContact { _id: string; name: string; email?: string; emails?: string[]; allEmails?: string[]; mobile?: string; }
export interface Client { clientId: string; companyName: string; category: string; contacts?: ClientContact[]; }
export interface BillingTargetBreakdown {
  categoryId: string; categoryLabel: string; type: CreditType;
  quantity: number; rate: number; taxableAmount: number;
  gstPercent: number; gstAmount: number; totalAmount: number;
  rateSource?: "transaction" | "manual";
}
export interface Billing {
  _id: string; clientId: string; financialYear: string;
  govtCharges: number; consultancyCharges: number; targetCharges: number; otherCharges: number;
  totalAmount: number; dueDate?: string | null; daysOverdue?: number;
  targetBreakdown?: BillingTargetBreakdown[]; notes?: string;
  totalPaid: number; pendingAmount: number; paymentStatus: string;
  invoiceCreated?: boolean; invoiceNumber?: string;
  invoiceDate?: string | null; invoiceAmount?: number | null;
}
export interface Payment {
  _id: string; clientId: string; financialYear: string;
  amountPaid: number; paymentType?: "billing" | "advance";
  paymentDate: string; paymentMode: string;
  referenceNumber?: string; notes?: string;
  source?: "direct" | "advance_application";
}
export interface EmailOption { label: string; email: string; }
export type BillingFilter = "all" | "pending" | "paid" | "partial" | "unpaid" | "advance" | "overdue" | "invoice-pending" | "invoice-created";
export type ViewMode = "cards" | "table";
export type BillingTab = "billing" | "advances";
export type CreditType = "RECYCLING" | "EOL";
export interface TargetEntry { categoryId: string; type: CreditType; value: number; }
export interface FinancialYearRecord {
  targets?: TargetEntry[];
  cat1Target?: number; cat2Target?: number; cat3Target?: number; cat4Target?: number;
  targetCat1?: number; targetCat2?: number; targetCat3?: number; targetCat4?: number;
}
export interface CreditTransaction {
  creditType?: "Recycling" | "EOL";
  rateCat1?: number; rateCat2?: number; rateCat3?: number; rateCat4?: number;
  rate?: number; date?: string;
}
export interface TargetBillingRow {
  key: string; categoryId: string; type: CreditType;
  quantity: string; rate: string; gstPercent: string;
  include: boolean; rateSource: "transaction" | "manual";
}
export interface AdvanceClientRow {
  clientId: string;
  clientName: string;
  available: number;
  applied: number;
  lastAdvanceDate?: string;
  advances: Payment[];
  appliedPayments: Payment[];
  pendingBillings: Billing[];
}
export interface BillingSummary {
  totalBilled: number;
  totalCollected: number;
  totalPending: number;
  totalAdvance: number;
  invoiceGap: number;
  paidCount: number;
  partialCount: number;
  unpaidCount: number;
  pendingCount: number;
  collectionPct: number;
  overdueCount: number;
  aging: {
    notDue: number;
    days0To30: number;
    days31To60: number;
    days60Plus: number;
  };
}
export interface BillingFilterOption {
  value: BillingFilter;
  label: string;
  count: number;
  separator?: boolean;
}
