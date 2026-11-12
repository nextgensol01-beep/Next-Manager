import mongoose from "mongoose";
import type { BillingCategoryAssignment } from "@/lib/billing-report";

// Report-only annotations: historical Billing/Payment documents stay untouched.
function collection() {
  if (!mongoose.connection.db) throw new Error("Database unavailable");
  return mongoose.connection.db.collection<BillingCategoryAssignment & { _id: string; updatedBy?: string; updatedAt?: Date }>("billingreportcategories");
}
export async function readBillingCategories(billingIds: string[]) {
  if (!billingIds.length) return [];
  return collection().find({ billingId: { $in: billingIds } }, { projection: { billingId: 1, componentKey: 1, category: 1 } }).toArray();
}
export async function writeBillingCategory(assignment: BillingCategoryAssignment, userId: string) {
  await collection().updateOne({ _id: `${assignment.billingId}:${assignment.componentKey}` }, { $set: { ...assignment, updatedBy: userId, updatedAt: new Date() } }, { upsert: true });
}
