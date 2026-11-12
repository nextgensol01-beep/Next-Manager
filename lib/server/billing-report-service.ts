import { z } from "zod";
import Billing from "@/models/Billing";
import Payment from "@/models/Payment";
import Client from "@/models/Client";
import { buildBillingReport, billingComponents, type FinancialRecord } from "@/lib/billing-report";
import { BILLING_REPORT_CATEGORIES } from "@/lib/billing-report-categories";
import { FINANCIAL_YEARS } from "@/lib/utils";
import { readBillingCategories, writeBillingCategory } from "@/lib/server/billing-report-category-store";
import { withLegacyBillingFields } from "@/lib/billing-utils";

const dateInput = z.string().refine(value => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, "Invalid date");
export const billingReportOptionsSchema = z.object({
  financialYear: z.string().refine(value => FINANCIAL_YEARS.includes(value), "Invalid financial year"),
  view: z.enum(["company", "bill", "component"]).default("company"),
  search: z.string().trim().max(160).default(""),
  billType: z.enum(["all", "annual_return", "general"]).default("all"),
  category: z.enum(["all", ...BILLING_REPORT_CATEGORIES.map(c => c.id)]).default("all"),
  paymentStatus: z.enum(["all", "paid", "partial", "unpaid"]).default("all"),
  invoiceState: z.enum(["all", "created", "not-created"]).default("all"),
  dateBasis: z.enum(["invoiceDate", "billDate"]).default("invoiceDate"),
  dateFrom: dateInput.default(""), dateTo: dateInput.default(""), includeUndated: z.boolean().default(false),
  page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(25),
}).refine(o => !o.dateFrom || !o.dateTo || o.dateFrom <= o.dateTo, "Invalid date range");

export async function executeBillingReport(raw: unknown, exportAll = false, clientId?: string) {
  const options = billingReportOptionsSchema.parse(raw);
  const clientScope = clientId ? { clientId } : {};
  const bills = await Billing.find({ financialYear: options.financialYear, ...clientScope }).select("clientId financialYear billType billTitle totalAmount govtCharges consultancyCharges targetCharges otherCharges lineItems targetBreakdown invoiceNumber invoiceCreated invoiceDate invoiceAmount billDate").lean() as FinancialRecord[];
  const ids = bills.map(b => String(b._id));
  const [payments, clients, assignments] = await Promise.all([
    Payment.find({ $or: [{ financialYear: options.financialYear, ...clientScope }, { billingId: { $in: ids } }, { paymentType: "advance", clientId: { $in: [...new Set(bills.map(b => b.clientId))] } }] }).select("clientId financialYear billingId amountPaid paymentType source").lean() as Promise<FinancialRecord[]>,
    Client.find(clientScope).select("clientId companyName").lean() as Promise<FinancialRecord[]>,
    readBillingCategories(ids),
  ]);
  return buildBillingReport(bills.map(withLegacyBillingFields), payments, clients, options, assignments, exportAll);
}

export async function assignBillingCategory(raw: unknown, userId: string) {
  const input = z.object({ billingId: z.string().regex(/^[a-f\d]{24}$/i), componentKey: z.string().min(1).max(100), category: z.enum(BILLING_REPORT_CATEGORIES.map(c => c.id)) }).parse(raw);
  const bill = await Billing.findById(input.billingId).lean() as FinancialRecord | null;
  if (!bill || !billingComponents(bill).some(c => c.key === input.componentKey)) throw new Error("Component changed or no longer exists. Refresh the report.");
  await writeBillingCategory(input, userId);
  return { saved: true };
}
