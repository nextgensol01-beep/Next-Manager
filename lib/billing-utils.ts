import { type Collection } from "mongodb";
import {
  type BillingType,
  type IBillingLineItem,
  type IBillingTargetBreakdownRow,
} from "@/models/Billing";

const roundBillingMoney = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export const annualReturnBillFilter = {
  $or: [{ billType: "annual_return" }, { billType: { $exists: false } }],
};

/** Present the former backfill defaults without persisting them during a read. */
export function withLegacyBillingFields<T extends Record<string, unknown>>(bill: T): T {
  return Object.hasOwn(bill, "billType")
    ? bill
    : { ...bill, billType: "annual_return", billTitle: "Annual Return Filing" };
}

/**
 * Recomputes and persists the denormalized `totalPaid` on a Billing document
 * by summing all non-advance Payment records for the same clientId + financialYear.
 * Call this after any Payment create / update / delete that affects billing payments.
 */
export async function syncBillingTotalPaid(
  billingCollection: Collection,
  paymentCollection: Collection,
  clientId: string,
  financialYear: string
): Promise<void> {
  const billings = await billingCollection
    .find({ clientId, financialYear })
    .project({ _id: 1, billType: 1 })
    .toArray();

  await Promise.all(billings.map(async (billing) => {
    const billingId = String(billing._id);
    const billType: BillingType = billing.billType === "general" ? "general" : "annual_return";
    const allocation: Record<string, unknown>[] = [{ billingId }];
    if (billType === "annual_return") {
      allocation.push(
        { billingId: { $in: ["", null] }, clientId, financialYear },
        { billingId: { $exists: false }, clientId, financialYear }
      );
    }

    const result = await paymentCollection.aggregate([
      { $match: { paymentType: { $ne: "advance" }, $or: allocation } },
      { $group: { _id: null, totalPaid: { $sum: "$amountPaid" } } },
    ]).toArray();

    await billingCollection.updateOne(
      { _id: billing._id },
      { $set: { totalPaid: result[0]?.totalPaid ?? 0 } }
    );
  }));
}


export const CATEGORY_LABELS: Record<string, string> = {
  "1": "Category I",
  "2": "Category II",
  "3": "Category III",
  "4": "Category IV",
};

export function normalizeTargetBreakdown(value: unknown): IBillingTargetBreakdownRow[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      const source = entry && typeof entry === "object" ? entry as Partial<IBillingTargetBreakdownRow> : {};
      const categoryId = String(source.categoryId || "");
      const type: IBillingTargetBreakdownRow["type"] = String(source.type).toUpperCase() === "EOL" ? "EOL" : "RECYCLING";
      const quantity = Number(source.quantity || 0);
      const rate = Number(source.rate || 0);
      const gstPercent = Number(source.gstPercent || 0);
      const taxableAmount = roundBillingMoney(quantity * rate);
      const gstAmount = roundBillingMoney(taxableAmount * (gstPercent / 100));
      const totalAmount = roundBillingMoney(taxableAmount + gstAmount);
      const rateSource: IBillingTargetBreakdownRow["rateSource"] = source.rateSource === "transaction" ? "transaction" : "manual";

      return {
        categoryId,
        categoryLabel: String(source.categoryLabel || CATEGORY_LABELS[categoryId] || `Category ${categoryId}`),
        type,
        quantity,
        rate,
        taxableAmount,
        gstPercent,
        gstAmount,
        totalAmount,
        rateSource,
      };
    })
    .filter((entry) => entry.categoryId && entry.quantity > 0 && entry.totalAmount > 0);
}

export function normalizeBillingLineItems(value: unknown): IBillingLineItem[] {
  if (!Array.isArray(value)) return [];

  return value.map((entry) => {
    const source = entry && typeof entry === "object"
      ? entry as Partial<IBillingLineItem>
      : {};
    const description = String(source.description || "").trim();
    const quantity = Math.max(0, Number(source.quantity || 0));
    const rate = Math.max(0, Number(source.rate || 0));
    const gstPercent = Math.max(0, Number(source.gstPercent || 0));
    const taxableAmount = roundBillingMoney(quantity * rate);
    const gstAmount = roundBillingMoney(taxableAmount * (gstPercent / 100));
    return {
      description,
      quantity,
      rate,
      taxableAmount,
      gstPercent,
      gstAmount,
      totalAmount: roundBillingMoney(taxableAmount + gstAmount),
      sourceQuotationId: String(source.sourceQuotationId || ""),
      sourceQuotationNumber: String(source.sourceQuotationNumber || ""),
      sourceRevisionNumber: source.sourceRevisionNumber === undefined || source.sourceRevisionNumber === null
        ? undefined
        : Number(source.sourceRevisionNumber),
      sourceLineId: String(source.sourceLineId || ""),
    };
  }).filter((entry) => entry.description && entry.quantity > 0 && entry.totalAmount > 0);
}

export function normalizeBillingBody(body: Record<string, unknown>) {
  const billType: BillingType = body.billType === "general" ? "general" : "annual_return";
  const govtCharges = Number(body.govtCharges || 0);
  const consultancyCharges = Number(body.consultancyCharges || 0);
  const targetCharges = Number(body.targetCharges || 0);
  const otherCharges = Number(body.otherCharges || 0);

  const lineItems = normalizeBillingLineItems(body.lineItems);
  const lineItemsTotal = roundBillingMoney(lineItems.reduce((sum, item) => sum + item.totalAmount, 0));
  const annualTotal = roundBillingMoney(govtCharges + consultancyCharges + targetCharges + otherCharges + lineItemsTotal);
  const generalTotal = lineItemsTotal;

  return {
    clientId: String(body.clientId || ""),
    financialYear: String(body.financialYear || ""),
    billType,
    billTitle: billType === "general"
      ? String(body.billTitle || "").trim()
      : "Annual Return Filing",
    billDate: body.billDate ? new Date(String(body.billDate)) : null,
    govtCharges: billType === "annual_return" ? govtCharges : 0,
    consultancyCharges: billType === "annual_return" ? consultancyCharges : 0,
    targetCharges: billType === "annual_return" ? targetCharges : 0,
    otherCharges: billType === "annual_return" ? otherCharges : 0,
    totalAmount: billType === "general" ? generalTotal : annualTotal,
    lineItems,
    targetBreakdown: billType === "annual_return" ? normalizeTargetBreakdown(body.targetBreakdown) : [],
    notes: typeof body.notes === "string" ? body.notes : "",
    dueDate: body.dueDate ? new Date(String(body.dueDate)) : null,
  };
}
