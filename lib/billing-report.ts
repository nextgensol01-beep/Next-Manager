import { createHash } from "node:crypto";
import { billingCategoryLabel, type BillingReportCategory } from "./billing-report-categories";

export type FinancialRecord = Record<string, unknown> & {
  financialYear?: string;
  billType?: string;
  billTitle?: string;
  lineItems?: FinancialRecord[];
};
export const paise = (value: unknown) => Math.round((Number(value) || 0) * 100);
export const money = (value: number) => value / 100;
const sumMoney = (values: unknown[]) => money(values.reduce<number>((sum, v) => sum + paise(v), 0));
const id = (value: unknown) => String(value ?? "");
export type PaymentIssue = { paymentId: string; clientId: string; billingId: string; amount: number; reason: string };

/** Work in paise and cap each bill separately so one bill's surplus cannot cover another. */
export function billSettlement(billedPaise: number, allocatedPaise: number) {
  const outstanding = Math.max(0, billedPaise - allocatedPaise);
  const overpayment = Math.max(0, allocatedPaise - billedPaise);
  const paymentStatus = outstanding === 0 ? "paid" : allocatedPaise > 0 ? "partial" : "unpaid";
  return { outstanding, overpayment, paymentStatus } as const;
}

/** One payment belongs to at most one bill. Advances never settle a bill until applied. */
export function allocateBillingPayments(bills: FinancialRecord[], payments: FinancialRecord[], options: { allowCrossYearLinks?: boolean } = {}) {
  const billMap = new Map(bills.map(b => [id(b._id), b]));
  const annual = new Map<string, FinancialRecord[]>();
  for (const bill of bills) if ((bill.billType || "annual_return") === "annual_return") {
    const key = `${bill.clientId}:${bill.financialYear}`;
    annual.set(key, [...(annual.get(key) || []), bill]);
  }
  const paid = new Map<string, number>();
  const paymentCounts = new Map<string, number>();
  const advances = new Map<string, number>();
  const issues: PaymentIssue[] = [];
  const legacyIds: string[] = [];
  const allocatedBillIds = new Map<string, string>();
  for (const payment of payments) {
    const amount = paise(payment.amountPaid);
    if (!Number.isFinite(Number(payment.amountPaid)) || amount <= 0) {
      issues.push({ paymentId: id(payment._id), clientId: id(payment.clientId), billingId: id(payment.billingId), amount: money(amount), reason: "Invalid payment amount" });
      continue;
    }
    if (payment.paymentType === "advance") {
      advances.set(id(payment.clientId), (advances.get(id(payment.clientId)) || 0) + amount);
      continue;
    }
    let bill: FinancialRecord | undefined;
    let reason = "";
    if (payment.billingId) {
      bill = billMap.get(id(payment.billingId));
      if (!bill) reason = "Linked bill is missing or outside this financial year";
      else if (id(bill.clientId) !== id(payment.clientId)) reason = "Payment client does not match linked bill";
      else if (!options.allowCrossYearLinks && bill.financialYear !== payment.financialYear) reason = "Payment financial year does not match linked bill";
    } else {
      const candidates = annual.get(`${payment.clientId}:${payment.financialYear}`) || [];
      if (candidates.length === 1) { bill = candidates[0]; legacyIds.push(id(payment._id)); }
      else reason = candidates.length > 1 ? "Ambiguous legacy Annual Return allocation" : "No bill for legacy payment";
    }
    if (reason || !bill) {
      issues.push({ paymentId: id(payment._id), clientId: id(payment.clientId), billingId: id(payment.billingId), amount: money(amount), reason });
      continue;
    }
    const billId = id(bill._id);
    allocatedBillIds.set(id(payment._id), billId);
    paid.set(billId, (paid.get(billId) || 0) + amount);
    paymentCounts.set(billId, (paymentCounts.get(billId) || 0) + 1);
  }
  return { paid, paymentCounts, advances, issues, legacyIds, allocatedBillIds };
}

export type BillingComponent = {
  key: string; billingId: string; clientId: string; companyName: string; invoiceNumber: string;
  description: string; category: BillingReportCategory; categoryLabel: string;
  quantity: number | null; rate: number | null; taxable: number | null; gst: number | null; gross: number;
  taxKnown: boolean;
};
export type BillingBillRow = {
  billingId: string; clientId: string; companyName: string; financialYear: string; billType: string;
  title: string; invoiceNumber: string; invoiceCreated: boolean; invoiceDate: string; billDate: string;
  billed: number; selectedGross: number; paid: number; outstanding: number; overpayment: number; paymentStatus: "paid" | "partial" | "unpaid";
  paymentCount: number; components: BillingComponent[]; warnings: string[];
};
export type BillingCompanyRow = {
  clientId: string; companyName: string; billCount: number; billed: number; selectedGross: number; paid: number; outstanding: number;
  overpayment: number; advance: number; bills: BillingBillRow[];
};
export type BillingReportOptions = {
  financialYear: string; view: "company" | "bill" | "component"; search: string; billType: string;
  category: string; paymentStatus: string; invoiceState: string; dateBasis: "invoiceDate" | "billDate";
  dateFrom: string; dateTo: string; includeUndated: boolean; page: number; pageSize: number;
};
export type BillingCategoryAssignment = { billingId: string; componentKey: string; category: BillingReportCategory };
const date = (value: unknown) => value && !Number.isNaN(new Date(String(value)).getTime()) ? new Date(String(value)).toISOString().slice(0, 10) : "";

export function reconciledBillingTargetLines(bill: FinancialRecord): FinancialRecord[] {
  const rows = Array.isArray(bill.targetBreakdown) ? bill.targetBreakdown as FinancialRecord[] : [];
  return rows.length && rows.every(row => row && Number.isFinite(row.totalAmount) && Number.isFinite(row.taxableAmount) && Number.isFinite(row.gstAmount) && paise(row.taxableAmount) + paise(row.gstAmount) === paise(row.totalAmount))
    && paise(sumMoney(rows.map(row => Number(row.totalAmount)))) === paise(bill.targetCharges)
    ? rows : [];
}

export function billingComponents(bill: FinancialRecord, assignments: BillingCategoryAssignment[] = []): BillingComponent[] {
  const overrides = new Map(assignments.filter(a => a.billingId === id(bill._id)).map(a => [a.componentKey, a.category]));
  const rows: BillingComponent[] = [];
  const add = (key: string, description: string, gross: number, category: BillingReportCategory, detail?: FinancialRecord) => {
    const selected = overrides.get(key) || category;
    rows.push({ key, billingId: id(bill._id), clientId: id(bill.clientId), companyName: "", invoiceNumber: id(bill.invoiceNumber), description,
      category: selected, categoryLabel: billingCategoryLabel(selected), gross: money(paise(gross)),
      quantity: detail?.quantity == null ? null : Number(detail.quantity), rate: detail?.rate == null ? null : Number(detail.rate),
      taxable: detail ? Number(detail.taxableAmount) : null, gst: detail ? Number(detail.gstAmount) : null, taxKnown: Boolean(detail),
    });
  };
  if ((bill.billType || "annual_return") !== "general") {
    for (const [field, label] of [["govtCharges", "Government charges"], ["consultancyCharges", "Consultancy charges"], ["targetCharges", "EPR target charges"], ["otherCharges", "Other charges"]]) {
      const gross = Number(bill[field] || 0);
      if (!gross) continue;
      const breakdown = field === "targetCharges" ? reconciledBillingTargetLines(bill) : [];
      // The breakdown explains targetCharges; it is never financially additive.
      const detail = breakdown.length ? { quantity: breakdown.reduce((s: number, r: FinancialRecord) => s + Number(r.quantity || 0), 0), rate: null,
        taxableAmount: sumMoney(breakdown.map((r: FinancialRecord) => r.taxableAmount)), gstAmount: sumMoney(breakdown.map((r: FinancialRecord) => r.gstAmount)) } : undefined;
      add(`fixed:${field}`, label, gross, field === "targetCharges" ? "epr_target" : "unclassified", detail);
    }
  }
  (bill.lineItems || []).forEach((line: FinancialRecord, index: number) => {
    const fingerprint = createHash("sha256").update(JSON.stringify([line.description, line.quantity, line.rate, line.taxableAmount, line.gstPercent, line.gstAmount, line.totalAmount, line.sourceLineId])).digest("hex").slice(0, 24);
    const detail = Number.isFinite(line.taxableAmount) && Number.isFinite(line.gstAmount) && paise(line.taxableAmount) + paise(line.gstAmount) === paise(line.totalAmount) ? line : undefined;
    add(`line:${index}:${fingerprint}`, id(line.description) || "Unnamed item", Number(line.totalAmount || 0), "unclassified", detail);
  });
  return rows;
}

export function buildBillingReport(bills: FinancialRecord[], payments: FinancialRecord[], clients: FinancialRecord[], options: BillingReportOptions, assignments: BillingCategoryAssignment[] = [], exportAll = false) {
  const scopedBills = bills.filter(b => b.financialYear === options.financialYear);
  const allocation = allocateBillingPayments(scopedBills, payments);
  const clientMap = new Map(clients.map(c => [id(c.clientId), c]));
  const exclusions = { search: 0, billType: 0, invoiceState: 0, date: 0, paymentStatus: 0, category: 0 };
  let undated = 0;
  const rows: BillingBillRow[] = [];
  for (const bill of scopedBills) {
    const billingId = id(bill._id), clientId = id(bill.clientId);
    const companyName = id(clientMap.get(clientId)?.companyName) || `${clientId} (client unavailable)`;
    const billed = paise(bill.totalAmount), paid = allocation.paid.get(billingId) || 0;
    const { outstanding, overpayment, paymentStatus } = billSettlement(billed, paid);
    const billType = bill.billType || "annual_return";
    const invoiceDate = date(bill.invoiceDate), billDate = date(bill.billDate);
    const selectedDate = options.dateBasis === "invoiceDate" ? invoiceDate : billDate;
    if (!selectedDate) undated++;
    const components = billingComponents(bill, assignments).map(c => ({ ...c, companyName }));
    const warnings: string[] = [];
    if (!clientMap.has(clientId)) warnings.push("Client record unavailable");
    if (paise(sumMoney(components.map(c => c.gross))) !== billed) warnings.push("Component total differs from bill total");
    if (bill.invoiceAmount != null && paise(bill.invoiceAmount) !== billed) warnings.push("Recorded invoice amount differs from bill total");
    if (!selectedDate) warnings.push(`No ${options.dateBasis === "invoiceDate" ? "invoice" : "bill"} date recorded`);
    if (paid > billed) warnings.push("Bill overpayment requires review");
    const q = options.search.toLowerCase().trim();
    if (q && ![companyName, clientId, billingId, bill.invoiceNumber, bill.billTitle].some(s => id(s).toLowerCase().includes(q))) { exclusions.search++; continue; }
    if (options.billType !== "all" && options.billType !== billType) { exclusions.billType++; continue; }
    if (options.invoiceState !== "all" && (options.invoiceState === "created") !== Boolean(bill.invoiceCreated)) { exclusions.invoiceState++; continue; }
    if ((options.dateFrom || options.dateTo) && (!selectedDate ? !options.includeUndated : (options.dateFrom && selectedDate < options.dateFrom) || (options.dateTo && selectedDate > options.dateTo))) { exclusions.date++; continue; }
    if (options.paymentStatus !== "all" && options.paymentStatus !== paymentStatus) { exclusions.paymentStatus++; continue; }
    if (options.category !== "all" && !components.some(c => c.category === options.category)) { exclusions.category++; continue; }
    rows.push({ billingId, clientId, companyName, financialYear: bill.financialYear as string, billType, title: bill.billTitle || (billType === "annual_return" ? "Annual Return Filing" : "General bill"), invoiceNumber: id(bill.invoiceNumber), invoiceCreated: Boolean(bill.invoiceCreated), invoiceDate, billDate,
      billed: money(billed), selectedGross: sumMoney(components.filter(c => options.category === "all" || c.category === options.category).map(c => c.gross)), paid: money(paid), outstanding: money(outstanding), overpayment: money(overpayment), paymentStatus,
      paymentCount: allocation.paymentCounts.get(billingId) || 0, components, warnings });
  }
  rows.sort((a, b) => a.companyName.localeCompare(b.companyName) || a.billingId.localeCompare(b.billingId));
  const companies = new Map<string, BillingCompanyRow>();
  for (const row of rows) {
    const company = companies.get(row.clientId) || { clientId: row.clientId, companyName: row.companyName, billCount: 0, billed: 0, selectedGross: 0, paid: 0, outstanding: 0, overpayment: 0, advance: money(allocation.advances.get(row.clientId) || 0), bills: [] };
    company.bills.push(row); company.billCount++;
    for (const field of ["billed", "selectedGross", "paid", "outstanding", "overpayment"] as const) company[field] = sumMoney([company[field], row[field]]);
    companies.set(row.clientId, company);
  }
  const allComponents = rows.flatMap(r => r.components);
  const components = allComponents.filter(c => options.category === "all" || c.category === options.category);
  const allCompanyRows = [...companies.values()];
  const relevantClients = new Set(rows.map(r => r.clientId));
  const issues = allocation.issues.filter(p => !options.search || [p.clientId, p.billingId, p.paymentId, clientMap.get(p.clientId)?.companyName].some(s => id(s).toLowerCase().includes(options.search.toLowerCase().trim())));
  const summary = {
    baselineBills: scopedBills.length, baselineBilled: sumMoney(scopedBills.map(b => Number(b.totalAmount || 0))),
    billCount: rows.length, companyCount: companies.size,
    billed: sumMoney(rows.map(r => r.billed)), paid: sumMoney(rows.map(r => r.paid)), outstanding: sumMoney(rows.map(r => r.outstanding)),
    overpayment: sumMoney(rows.map(r => r.overpayment)), advance: money([...allocation.advances].filter(([key]) => relevantClients.has(key)).reduce((s, [, amount]) => s + amount, 0)),
    componentGross: sumMoney(components.map(c => c.gross)), allComponentGross: sumMoney(allComponents.map(c => c.gross)),
    unclassifiedCount: allComponents.filter(c => c.category === "unclassified").length,
    unclassifiedGross: sumMoney(allComponents.filter(c => c.category === "unclassified").map(c => c.gross)),
    discrepancyBills: rows.filter(r => r.warnings.includes("Component total differs from bill total")).length,
    unresolvedPaymentCount: issues.length, unresolvedPayments: sumMoney(issues.map(i => i.amount)),
    legacyAllocationCount: allocation.legacyIds.length, undated, excludedBills: scopedBills.length - rows.length, exclusions,
  };
  const totalRows = options.view === "company" ? companies.size : options.view === "bill" ? rows.length : components.length;
  const paginate = <T,>(values: T[]) => exportAll ? values : values.slice((options.page - 1) * options.pageSize, options.page * options.pageSize);
  return { options, summary, companies: options.view === "company" ? paginate(allCompanyRows) : [], bills: options.view === "bill" ? paginate(rows) : [], components: options.view === "component" ? paginate(components) : [], issues,
    pagination: { page: options.page, pageSize: options.pageSize, totalRows, totalPages: Math.max(1, Math.ceil(totalRows / options.pageSize)) } };
}
export type BillingReportResponse = ReturnType<typeof buildBillingReport>;
