import Billing from "@/models/Billing";
import Client from "@/models/Client";
import Payment from "@/models/Payment";
import { allocateBillingPayments, billingComponents, billSettlement, money, paise, reconciledBillingTargetLines, type BillingCategoryAssignment, type FinancialRecord } from "@/lib/billing-report";
import { BILLING_CONDITIONAL_CHARGES, BILLING_TARGET_COLUMNS, CHARGE_KINDS, TARGET_CATEGORIES } from "@/lib/report-billing-fields";
import { type BillingAnalysisSource } from "@/lib/report-datasets";
import type { ReportStudioCellValue, ReportStudioConfig, ReportStudioFilterGroup, ReportStudioResultRow } from "@/lib/report-studio";
import { createSearchMatcher } from "@/lib/search/client-search";
import { sumQuantities } from "@/lib/financial-year-coverage";
import { readBillingCategories } from "@/lib/server/billing-report-category-store";
import type { ReportDatasetRow } from "./report-detail-datasets";

type Values = Record<string, ReportStudioCellValue>;
type Charge = { key: string; values: Values };
type SelectedBill = { id: string; clientId: string; financialYear: string; values: Values; selected: Charge[]; fullCount: number };
const MAX_BILLS = 25_000;
const MAX_PAYMENTS = 100_000;
const MAX_CHARGES = 75_000;
const paymentFields = new Set(["bill.paid", "bill.outstanding", "bill.overpayment", "bill.paymentStatus", "bill.overdue"]);
const billOnlyValues = new Set(["bill.gross", "bill.chargeTypes", "bill.classifications", "bill.classificationCount", ...paymentFields]);
const billType = (bill: FinancialRecord) => !bill.billType || bill.billType === "annual_return" ? "Annual Return" : bill.billType === "general" ? "General" : null;
const text = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const date = (value: unknown) => value instanceof Date || typeof value === "string" ? new Date(value).toJSON()?.slice(0, 10) ?? null : null;
const knownMoney = (values: ReportStudioCellValue[]) => values.some(value => number(value) == null) ? null : money(values.reduce<number>((total, value) => total + paise(value), 0));
const distinctChargeValues = (charges: Charge[], field: string) => [...new Set(charges.map(charge => String(charge.values[field])))].sort();

function bounded<T>(rows: T[], maximum: number) {
  if (rows.length > maximum) throw new Error("Billing analysis exceeds the record limit. Narrow the financial years, bill type or client scope.");
  return rows;
}

function usesPaymentFields(group?: ReportStudioFilterGroup): boolean {
  return group?.children.some(child => child.kind === "group" ? usesPaymentFields(child) : paymentFields.has(child.field)) ?? false;
}

function normalizedTargetCategory(value: unknown) {
  const input = String(value ?? "").trim().toUpperCase();
  if (/^[1-4]$/.test(input)) return TARGET_CATEGORIES[Number(input) - 1];
  return TARGET_CATEGORIES.find(category => category === input.replace(/^CAT(?:EGORY)?[\s-]*/, "CAT-")) ?? null;
}

function chargeLines(bill: FinancialRecord, annotations: BillingCategoryAssignment[]): Charge[] {
  return billingComponents(bill, annotations).flatMap<Charge>(component => {
    const kind = ({
      "fixed:targetCharges": CHARGE_KINDS[0], "fixed:govtCharges": CHARGE_KINDS[1],
      "fixed:consultancyCharges": CHARGE_KINDS[2], "fixed:otherCharges": CHARGE_KINDS[3],
    } as Record<string, string>)[component.key] ?? CHARGE_KINDS[4];
    const base = { "charge.kind": kind, "charge.classification": component.categoryLabel, "charge.description": component.description };
    const targetLines = component.key === "fixed:targetCharges" ? reconciledBillingTargetLines(bill) : [];
    if (targetLines.length) return targetLines.map((line, index) => ({
      key: `${component.key}:${index}`,
      values: { ...base, "charge.targetCategory": normalizedTargetCategory(line.categoryId),
        "charge.creditType": line.type === "RECYCLING" ? "Recycling" : line.type === "EOL" ? "EOL" : null,
        "charge.quantity": number(line.quantity), "charge.targetQuantity": number(line.quantity), "charge.rate": number(line.rate), "charge.gstRate": number(line.gstPercent),
        "charge.gross": money(paise(line.totalAmount)), "charge.taxable": money(paise(line.taxableAmount)), "charge.gst": money(paise(line.gstAmount)) },
    }));
    const line = component.key.startsWith("line:") ? bill.lineItems?.[Number(component.key.split(":")[1])] : undefined;
    return [{ key: component.key, values: {
      ...base, "charge.targetCategory": null, "charge.creditType": null, "charge.targetQuantity": null,
      "charge.quantity": number(line?.quantity ?? component.quantity), "charge.rate": number(line?.rate ?? component.rate),
      "charge.gstRate": number(line?.gstPercent), "charge.gross": line ? number(line.totalAmount) : number(component.gross),
      "charge.taxable": number(component.taxable), "charge.gst": number(component.gst),
    } }];
  });
}

function mandatoryScope(config: ReportStudioConfig) {
  const predicates: Record<string, unknown>[] = [];
  const dateFields: Record<string, string> = { "bill.date": "billDate", "bill.invoiceDate": "invoiceDate", "bill.dueDate": "dueDate" };
  const dateOnly = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
  const visit = (group?: ReportStudioFilterGroup) => {
    if (!group || group.logic !== "and") return;
    for (const clause of group.children) {
      if (clause.kind === "group") { visit(clause); continue; }
      const storedDate = dateFields[clause.field];
      if (storedDate && ["eq", "gte", "lte", "between"].includes(clause.operator)) {
        const first = dateOnly(clause.value);
        const last = clause.operator === "between" ? dateOnly(clause.secondValue) : first;
        if (first != null && last != null) {
          const range = {
            ...(clause.operator !== "lte" && { $gte: new Date(first) }),
            ...(clause.operator !== "gte" && { $lt: new Date(last + 86_400_000) }),
          };
          predicates.push({ $or: [{ [storedDate]: { $type: "string" } }, { [storedDate]: range }] });
        }
      }
      if (clause.operator !== "eq" || typeof clause.value !== "string") continue;
      if (clause.field === "bill.type") {
        if (clause.value.toLowerCase() === "general") predicates.push({ billType: "general" });
        if (clause.value.toLowerCase() === "annual return") predicates.push({ billType: { $in: ["annual_return", "", null] } });
      } else if (clause.field === "financialYear.year" && /^\d{4}-\d{2}$/.test(clause.value)) {
        predicates.push({ financialYear: clause.value });
      } else if (clause.field === "bill.id" && /^[a-f\d]{24}$/i.test(clause.value)) {
        predicates.push({ _id: clause.value.toLowerCase() });
      }
    }
  };
  visit(config.billingScope?.filters);
  return predicates.length ? { $and: predicates } : {};
}

function chargeTotals(bills: SelectedBill[]): Values {
  const charges = bills.flatMap(bill => bill.selected);
  const incomplete = bills.some(bill => !bill.fullCount && bill.values["bill.gross"] !== 0);
  const unclassifiedTarget = charges.some(charge => charge.values["charge.kind"] === CHARGE_KINDS[0] &&
    (!charge.values["charge.targetCategory"] || !charge.values["charge.creditType"]));
  const gross = (items: Charge[]) => knownMoney(items.map(charge => charge.values["charge.gross"]));
  return {
    "charge.selectedGross": incomplete ? null : gross(charges),
    "charge.selectedTaxable": charges.length && !incomplete ? knownMoney(charges.map(charge => charge.values["charge.taxable"])) : null,
    "charge.selectedGst": charges.length && !incomplete ? knownMoney(charges.map(charge => charge.values["charge.gst"])) : null,
    "charge.classifications": distinctChargeValues(charges, "charge.classification"),
    ...Object.fromEntries(BILLING_CONDITIONAL_CHARGES.map(({ field, value, id }) => [id, incomplete ? null : gross(charges.filter(charge => charge.values[field] === value))])),
    ...Object.fromEntries(BILLING_TARGET_COLUMNS.flatMap(({ category, type, prefix }) => {
      const matching = charges.filter(charge => charge.values["charge.targetCategory"] === category && charge.values["charge.creditType"] === type);
      const quantities = matching.map(charge => number(charge.values["charge.quantity"]));
      const rates = new Set(matching.map(charge => number(charge.values["charge.rate"])));
      const known = !incomplete && !unclassifiedTarget;
      return [[`${prefix}.quantity`, known && quantities.every((value): value is number => value != null) ? sumQuantities(quantities) : null],
        [`${prefix}.rate`, known && rates.size === 1 ? [...rates][0] : null], [`${prefix}.gross`, known ? gross(matching) : null]];
    })),
  };
}

export async function loadBillingAnalysis(
  source: BillingAnalysisSource,
  config: ReportStudioConfig,
  matchesScope: (values: Values) => boolean,
): Promise<{ rows: ReportDatasetRow[]; messages: string[] }> {
  const years = [...new Set([config.financialYear, ...(config.billingScope?.years ?? [])])];
  const bills = bounded(await Billing.find({ financialYear: { $in: years }, ...mandatoryScope(config) })
    .select("clientId financialYear billType billTitle billDate dueDate invoiceDate invoiceNumber totalAmount govtCharges consultancyCharges targetCharges otherCharges lineItems targetBreakdown")
    .limit(MAX_BILLS + 1).lean<FinancialRecord[]>(), MAX_BILLS);
  if (!bills.length) return { rows: [], messages: [] };
  const ids = bills.map(bill => String(bill._id));
  const clientIds = [...new Set(bills.map(bill => String(bill.clientId ?? "")).filter(Boolean))];
  const candidateYears = [...new Set(bills.map(bill => bill.financialYear))];
  const annualClients = [...new Set(bills.filter(bill => billType(bill) === "Annual Return").map(bill => String(bill.clientId ?? "")).filter(Boolean))];
  const needsPayments = source !== "billing-charges" || usesPaymentFields(config.billingScope?.filters);
  const [clients, annotations, payments] = await Promise.all([
    Client.find({ clientId: { $in: clientIds } }).select("clientId companyName category state").lean<FinancialRecord[]>(),
    readBillingCategories(ids),
    needsPayments ? Payment.find({ paymentType: { $ne: "advance" }, $or: [
      { billingId: { $in: ids } },
      ...(annualClients.length ? [{ billingId: { $in: ["", null] }, clientId: { $in: annualClients }, financialYear: { $in: candidateYears } }] : []),
    ] }).select("billingId clientId financialYear paymentType amountPaid").limit(MAX_PAYMENTS + 1).lean<FinancialRecord[]>().then(rows => bounded(rows, MAX_PAYMENTS)) : Promise.resolve([]),
  ]);
  // Check legacy ambiguity against the full client/FY, even when the report selects one bill.
  const legacyClientIds = [...new Set(payments.filter(payment => !payment.billingId).map(payment => String(payment.clientId)))];
  const siblings = legacyClientIds.length ? bounded(await Billing.find({
    clientId: { $in: legacyClientIds }, financialYear: { $in: candidateYears }, billType: { $in: ["annual_return", "", null] },
  }).select("clientId financialYear billType").limit(MAX_BILLS + 1).lean<FinancialRecord[]>(), MAX_BILLS) : [];
  const allocated = allocateBillingPayments([...new Map([...siblings, ...bills].map(bill => [String(bill._id), bill])).values()], payments, { allowCrossYearLinks: true });
  const byClient = new Map(clients.map(client => [client.clientId, client]));
  const byBill = new Map<string, BillingCategoryAssignment[]>();
  for (const annotation of annotations) {
    const list = byBill.get(annotation.billingId) ?? [];
    list.push(annotation);
    byBill.set(annotation.billingId, list);
  }
  const search = createSearchMatcher(config.search);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const selectedBills: SelectedBill[] = [];
  let unreconciled = 0;
  let unsplitTargets = 0;
  let chargeCount = 0;
  for (const bill of bills) {
    const id = String(bill._id), clientId = String(bill.clientId ?? ""), financialYear = bill.financialYear!;
    const client = byClient.get(clientId);
    const gross = number(bill.totalAmount);
    const paid = allocated.paid.get(id) ?? 0;
    const settlement = gross == null ? null : billSettlement(paise(gross), paid);
    const outstanding = settlement ? money(settlement.outstanding) : null;
    const due = date(bill.dueDate);
    const charges = chargeLines(bill, byBill.get(id) ?? []);
    const classifications = distinctChargeValues(charges, "charge.classification");
    chargeCount += charges.length;
    if (chargeCount > MAX_CHARGES) throw new Error("Billing analysis exceeds the charge limit. Narrow the financial years or bill type.");
    const values: Values = {
      "client.clientId": clientId || null, "client.companyName": text(client?.companyName) ?? (clientId ? `${clientId} (client unavailable)` : null),
      "client.category": text(client?.category), "client.state": text(client?.state), "financialYear.year": financialYear,
      "bill.id": id, "bill.reference": text(bill.invoiceNumber) ?? text(bill.billTitle) ?? id, "bill.invoiceNumber": text(bill.invoiceNumber),
      "bill.type": billType(bill), "bill.date": date(bill.billDate), "bill.invoiceDate": date(bill.invoiceDate), "bill.dueDate": due,
      "bill.month": date(bill.billDate)?.slice(0, 7) ?? null,
      "bill.invoiceMonth": date(bill.invoiceDate)?.slice(0, 7) ?? null,
      "bill.dueMonth": due?.slice(0, 7) ?? null,
      "bill.gross": gross, "bill.paid": money(paid), "bill.outstanding": outstanding,
      "bill.overpayment": settlement ? money(settlement.overpayment) : null,
      "bill.paymentStatus": settlement ? ({ paid: "Paid", partial: "Partial", unpaid: "Unpaid" } as const)[settlement.paymentStatus] : null,
      "bill.overdue": outstanding == null ? null : outstanding === 0 ? false : due ? due < today : null,
      "bill.chargeTypes": distinctChargeValues(charges, "charge.kind"),
      "bill.classifications": classifications,
      "bill.classificationCount": classifications.length,
    };
    const billMatchesSearch = !config.search || search(Object.entries(values)
      .flatMap(([field, value]) => !billOnlyValues.has(field) && typeof value === "string" ? [value] : []).join(" "));
    const selected = charges.filter(charge => (billMatchesSearch || search(Object.values(charge.values).filter(value => typeof value === "string").join(" "))) && matchesScope({ ...values, ...charge.values }));
    if (!selected.length && (charges.length || !billMatchesSearch || !matchesScope(values))) continue;
    const componentGross = knownMoney(charges.map(charge => charge.values["charge.gross"]));
    if (componentGross == null || gross == null || paise(componentGross) !== paise(gross)) unreconciled++;
    if (selected.some(charge => charge.key === "fixed:targetCharges")) unsplitTargets++;
    selectedBills.push({ id, clientId, financialYear, values, selected, fullCount: charges.length });
  }

  const drilldown = (bill: SelectedBill, destination: "billing-bills" | "billing-charges"): ReportStudioResultRow["billingDrilldown"] => ({
    source: destination, clientId: bill.clientId, financialYear: bill.financialYear, ...(destination === "billing-charges" ? { billId: bill.id } : {}),
  });
  let rows: ReportDatasetRow[];
  if (source === "billing-charges") {
    rows = selectedBills.flatMap(bill => {
      const identity = Object.fromEntries(Object.entries(bill.values).filter(([field]) => !billOnlyValues.has(field)));
      return bill.selected.map(charge => ({ id: `${bill.id}:${charge.key}`, clientId: bill.clientId,
        href: `/dashboard/billing?fy=${encodeURIComponent(bill.financialYear)}&clientId=${encodeURIComponent(bill.clientId)}`,
        values: { ...identity, ...charge.values } }));
    });
  } else if (source === "billing-bills") {
    rows = selectedBills.map(bill => ({ id: bill.id, clientId: bill.clientId, values: { ...bill.values, ...chargeTotals([bill]) },
      billingDrilldown: drilldown(bill, "billing-charges") }));
  } else {
    const companies = new Map<string, SelectedBill[]>();
    for (const bill of selectedBills) {
      const key = JSON.stringify([bill.clientId || bill.id, bill.financialYear]);
      const company = companies.get(key) ?? [];
      company.push(bill);
      companies.set(key, company);
    }
    rows = [...companies].map(([id, company]) => {
      const [first] = company;
      const total = (field: string, list = company) => knownMoney(list.map(bill => bill.values[field]));
      return { id, clientId: first.clientId,
        ...(first.clientId ? { billingDrilldown: drilldown(first, "billing-bills") } : {}),
        values: {
          ...Object.fromEntries(Object.entries(first.values).filter(([key]) => key.startsWith("client.") || key === "financialYear.year")),
          "bill.count": company.length,
          "bill.gross": total("bill.gross"), "bill.paid": total("bill.paid"), "bill.outstanding": total("bill.outstanding"), "bill.overpayment": total("bill.overpayment"),
          "bill.generalGross": total("bill.gross", company.filter(bill => bill.values["bill.type"] === "General")),
          "bill.annualReturnGross": total("bill.gross", company.filter(bill => bill.values["bill.type"] === "Annual Return")),
          "bill.overdueCount": company.some(bill => bill.values["bill.overdue"] == null) ? null : company.filter(bill => bill.values["bill.overdue"] === true).length,
          ...chargeTotals(company),
        } };
    });
  }
  return { rows, messages: [
    ...(unreconciled ? [`${unreconciled} qualifying bills have missing or unreconciled charge totals. Recorded bill gross and identified charge amounts are shown separately.`] : []),
    ...(unsplitTargets ? [`${unsplitTargets} qualifying bills have EPR gross without a reconciled category split.`] : []),
    ...(allocated.issues.length ? [`${allocated.issues.length} payment records in the input scope require allocation review.`] : []),
  ] };
}
