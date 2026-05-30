export const QUOTATION_STATUSES = [
  "Draft",
  "Finalized",
  "Sent",
  "RevisionRequested",
  "Accepted",
  "Rejected",
  "Expired",
] as const;

export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const GST_PERCENT_OPTIONS = [0, 5, 12, 18, 28] as const;

export const TERMINAL_QUOTATION_STATUSES: QuotationStatus[] = ["Accepted", "Rejected", "Expired"];
export const EDITABLE_QUOTATION_STATUSES: QuotationStatus[] = ["Draft"];
export const REVISION_SOURCE_STATUSES: QuotationStatus[] = ["Finalized", "Sent", "RevisionRequested"];
export const EMAIL_DRAFT_SOURCE_STATUSES: QuotationStatus[] = ["Finalized", "Sent"];

export const ALLOWED_QUOTATION_STATUS_TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
  Draft: ["Draft"],
  Finalized: ["Finalized", "Sent", "Accepted", "Rejected", "RevisionRequested", "Expired"],
  Sent: ["Sent", "Accepted", "Rejected", "RevisionRequested", "Expired"],
  RevisionRequested: ["RevisionRequested"],
  Accepted: ["Accepted"],
  Rejected: ["Rejected"],
  Expired: ["Expired"],
};

export const RESPONSE_ACTION_STATUSES: QuotationStatus[] = [
  "Accepted",
  "RevisionRequested",
  "Rejected",
  "Sent",
  "Expired",
];

export function isQuotationStatus(value: unknown): value is QuotationStatus {
  return typeof value === "string" && QUOTATION_STATUSES.includes(value as QuotationStatus);
}

export function getAllowedQuotationTransitions(status: QuotationStatus): QuotationStatus[] {
  return ALLOWED_QUOTATION_STATUS_TRANSITIONS[status].filter((next) => next !== status);
}

export function canChangeQuotationStatus(from: QuotationStatus, to: QuotationStatus): boolean {
  return ALLOWED_QUOTATION_STATUS_TRANSITIONS[from].includes(to);
}

export function canEditQuotation(status: QuotationStatus): boolean {
  return EDITABLE_QUOTATION_STATUSES.includes(status);
}

export function canCreateQuotationRevision(status: QuotationStatus): boolean {
  return REVISION_SOURCE_STATUSES.includes(status);
}

export function canCreateQuotationEmailDraft(status: QuotationStatus): boolean {
  return EMAIL_DRAFT_SOURCE_STATUSES.includes(status);
}

export function isTerminalQuotationStatus(status: QuotationStatus): boolean {
  return TERMINAL_QUOTATION_STATUSES.includes(status);
}

export type QuotationItemInput = {
  description: string;
  category: string;
  type: string;
  quantity: number;
  rate: number;
  gstPercent: number;
};

export type CalculatedQuotationItem = QuotationItemInput & {
  subtotal: number;
  gstAmount: number;
  totalAmount: number;
};

export function calculateQuotationItems(items: QuotationItemInput[]) {
  const calculatedItems: CalculatedQuotationItem[] = items.map((item) => {
    const quantity = Number(item.quantity) || 0;
    const rate = Number(item.rate) || 0;
    const gstPercent = Number(item.gstPercent) || 0;
    const subtotal = quantity * rate;
    const gstAmount = subtotal * (gstPercent / 100);

    return {
      description: item.description.trim(),
      category: item.category.trim(),
      type: item.type.trim(),
      quantity,
      rate,
      gstPercent,
      subtotal,
      gstAmount,
      totalAmount: subtotal + gstAmount,
    };
  });

  const itemsSubtotal = calculatedItems.reduce((sum, item) => sum + item.subtotal, 0);
  const itemsGst = calculatedItems.reduce((sum, item) => sum + item.gstAmount, 0);

  return { calculatedItems, itemsSubtotal, itemsGst };
}

export function calculateQuotationGrandTotal(values: {
  itemsSubtotal: number;
  itemsGst: number;
  consultationCharges: number;
  consultationGstPercent: number;
  governmentFees: number;
}) {
  const consultationGstAmount = values.consultationCharges * (values.consultationGstPercent / 100);
  const grandTotal =
    values.itemsSubtotal +
    values.itemsGst +
    values.consultationCharges +
    consultationGstAmount +
    values.governmentFees;

  return { consultationGstAmount, grandTotal };
}
