import Billing from "@/models/Billing";
import Payment from "@/models/Payment";
import { allocateBillingPayments, billSettlement, money, paise, type FinancialRecord } from "@/lib/billing-report";
import type { ReportStudioCellValue } from "@/lib/report-studio";

type Values = Record<string, ReportStudioCellValue>;
type Entry = { record: FinancialRecord; values: Values };
export type FinanceReportSource = "payment-register" | "advance-register" | "finance-activity";
const limit = 25_000;
const bounded = <T,>(rows: T[]) => {
  if (rows.length > limit) throw new Error("This financial report exceeds the detail limit. Select fewer financial years.");
  return rows;
};
const billProjection = "clientId financialYear billType billTitle billDate invoiceDate dueDate invoiceNumber totalAmount";
const date = (value: unknown) => typeof value === "string" || value instanceof Date ? new Date(value).toJSON() : null;
const numeric = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const text = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
const advanceApplicationNote = /applied from advance/i;
const advanceApplicationMode = "Advance Applied";

function isAdvanceApplication(payment: FinancialRecord) {
  return payment.source === "advance_application" || payment.paymentMode === advanceApplicationMode
    || advanceApplicationNote.test(String(payment.notes ?? ""));
}

function receiptYear(value: unknown) {
  const iso = date(value);
  if (!iso) return null;
  const year = Number(iso.slice(0, 4)) - (Number(iso.slice(5, 7)) < 4 ? 1 : 0);
  return `${year}-${String(year + 1).slice(-2)}`;
}

export async function loadFinanceEntries(source: FinanceReportSource, years: string[], paymentPeriod?: "receipt" | "recorded"): Promise<{ entries: Entry[]; messages: string[] }> {
  const finance = source === "finance-activity";
  const advances = source === "advance-register";
  const useReceiptDate = finance || advances || paymentPeriod === "receipt";
  const yearQuery = { financialYear: { $in: years } };
  const scopeBills = finance ? bounded(await Billing.find(yearQuery).select(billProjection).limit(limit + 1).lean<FinancialRecord[]>()) : [];
  const dateRanges = years.map(year => {
    const start = Number(year.slice(0, 4));
    return { paymentDate: { $gte: new Date(Date.UTC(start, 3, 1)), $lt: new Date(Date.UTC(start + 1, 3, 1)) } };
  });
  const payments = bounded(await Payment.find({
    $or: [yearQuery, ...(useReceiptDate ? [...dateRanges, { paymentDate: { $type: "string" } }] : []),
      ...(scopeBills.length ? [{ billingId: { $in: scopeBills.map(bill => String(bill._id)) } }] : [])],
    ...(advances ? { $and: [{ $or: [{ paymentType: "advance" }, { source: "advance_application" }, { paymentMode: advanceApplicationMode }, { notes: advanceApplicationNote }] }] } : {}),
  }).select("clientId financialYear billingId paymentType source paymentDate paymentMode referenceNumber amountPaid notes").limit(limit + 1).lean<FinancialRecord[]>());
  const inYear = (year: unknown) => typeof year === "string" && years.includes(year);
  const billIds = [...new Set(payments.map(payment => String(payment.billingId || "")).filter(id => /^[a-f\d]{24}$/i.test(id)))];
  const legacy = payments.filter(payment => !payment.billingId && payment.paymentType !== "advance");
  const extraBills = billIds.length || legacy.length ? bounded(await Billing.find({
    $or: [
      ...(billIds.length ? [{ _id: { $in: billIds } }] : []),
      ...(legacy.length ? [{ clientId: { $in: [...new Set(legacy.map(payment => payment.clientId))] }, financialYear: { $in: [...new Set(legacy.map(payment => payment.financialYear))] },
        billType: { $in: ["annual_return", "", null] } }] : []),
    ],
  }).select(billProjection).limit(limit + 1).lean<FinancialRecord[]>()) : [];
  const bills = new Map([...scopeBills, ...extraBills].map(bill => [String(bill._id), bill]));
  const allocation = allocateBillingPayments([...bills.values()], payments, { allowCrossYearLinks: true });
  const issues = new Map(allocation.issues.map(issue => [issue.paymentId, issue.reason]));
  const legacyIds = new Set(allocation.legacyIds);
  const entries: Entry[] = finance ? scopeBills.map(bill => {
    const gross = numeric(bill.totalAmount);
    const paid = allocation.paid.get(String(bill._id)) ?? 0;
    return { record: { ...bill, _id: `bill:${bill._id}` }, values: {
      "record.date": date(bill.billDate), "record.status": "Bill", "record.reference": text(bill.invoiceNumber) ?? text(bill.billTitle),
      "finance.billReference": text(bill.invoiceNumber) ?? text(bill.billTitle) ?? String(bill._id),
      "finance.billId": String(bill._id), "finance.billFY": bill.financialYear ?? null,
      "finance.invoiceDate": date(bill.invoiceDate), "finance.dueDate": date(bill.dueDate),
      "finance.billed": gross, "finance.billAllocated": money(paid), "finance.outstanding": gross == null ? null : money(billSettlement(paise(gross), paid).outstanding),
      "finance.cash": 0, "finance.availableAdvance": 0,
    } };
  }) : [];

  for (const payment of payments) {
    const paymentId = String(payment._id);
    const isAdvance = payment.paymentType === "advance";
    const isApplication = isAdvanceApplication(payment);
    const receiptFY = receiptYear(payment.paymentDate);
    if (!inYear(isAdvance || !useReceiptDate ? payment.financialYear : receiptFY ?? payment.financialYear)) continue;
    if (finance && isApplication) continue;
    const amount = numeric(payment.amountPaid);
    const billId = allocation.allocatedBillIds.get(paymentId);
    const bill = billId ? bills.get(billId) : undefined;
    const reportFY = finance && !isAdvance ? receiptFY ?? payment.financialYear : payment.financialYear;
    entries.push({ record: { ...payment, financialYear: reportFY, _id: finance ? `payment:${paymentId}` : paymentId }, values: {
      "record.date": date(payment.paymentDate), "record.reference": text(payment.referenceNumber), "record.mode": text(payment.paymentMode),
      "record.status": isAdvance ? "Remaining advance record" : isApplication ? "Advance application" : "Billing payment",
      "record.amount": amount,
      "record.allocation": issues.has(paymentId) ? "Requires review" : isAdvance ? "Unapplied" : legacyIds.has(paymentId) ? "Allocated by legacy rule" : "Allocated",
      "record.reviewReason": issues.get(paymentId) ?? null,
      "finance.receiptFY": receiptFY, "finance.billFY": bill?.financialYear ?? null, "finance.billId": billId ?? null,
      "finance.billReference": bill ? text(bill.invoiceNumber) ?? text(bill.billTitle) ?? billId ?? null : null,
      "finance.invoiceDate": date(bill?.invoiceDate), "finance.dueDate": date(bill?.dueDate),
      "finance.billed": 0, "finance.billAllocated": 0, "finance.outstanding": 0,
      "finance.cash": !isAdvance && !isApplication ? amount : 0,
      "finance.allocated": billId ? amount : 0, "finance.unallocated": !isAdvance && !billId ? amount : 0,
      "finance.availableAdvance": isAdvance ? amount : 0, "finance.appliedAdvance": isApplication && billId ? amount : 0,
    } });
  }
  return { entries: bounded(entries), messages: [
    "Direct receipts use payment date. Bill allocations and outstanding use the bill's financial year and the current allocation state.",
    "Available advances are current balances from the selected recorded financial years. Advance receipts consumed by applications cannot be reconstructed from these records.",
    ...(finance ? ["Monthly outstanding is the current outstanding on bills issued in that month."] : []),
  ] };
}
