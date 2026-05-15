import { type IBillingTargetBreakdownRow } from "@/models/Billing";
import type { Collection } from "mongodb";

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
  const result = await paymentCollection
    .aggregate([
      {
        $match: {
          clientId,
          financialYear,
          paymentType: { $ne: "advance" },
        },
      },
      { $group: { _id: null, totalPaid: { $sum: "$amountPaid" } } },
    ])
    .toArray();

  const totalPaid = result[0]?.totalPaid ?? 0;
  await billingCollection.updateOne(
    { clientId, financialYear },
    { $set: { totalPaid } }
  );
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
      const taxableAmount = quantity * rate;
      const gstAmount = taxableAmount * (gstPercent / 100);
      const totalAmount = taxableAmount + gstAmount;
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

export function normalizeBillingBody(body: Record<string, unknown>) {
  const govtCharges = Number(body.govtCharges || 0);
  const consultancyCharges = Number(body.consultancyCharges || 0);
  const targetCharges = Number(body.targetCharges || 0);
  const otherCharges = Number(body.otherCharges || 0);

  return {
    clientId: String(body.clientId || ""),
    financialYear: String(body.financialYear || ""),
    govtCharges,
    consultancyCharges,
    targetCharges,
    otherCharges,
    totalAmount: govtCharges + consultancyCharges + targetCharges + otherCharges,
    targetBreakdown: normalizeTargetBreakdown(body.targetBreakdown),
    notes: typeof body.notes === "string" ? body.notes : "",
    dueDate: body.dueDate ? new Date(String(body.dueDate)) : null,
  };
}
