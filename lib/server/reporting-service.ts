import Client from "@/models/Client";
import FinancialYear from "@/models/FinancialYear";
import CreditTransaction from "@/models/CreditTransaction";
import Quotation from "@/models/Quotation";
import QuotationRevision from "@/models/QuotationRevision";
import Billing from "@/models/Billing";
import Payment from "@/models/Payment";
import Invoice from "@/models/Invoice";
import AnnualReturn from "@/models/AnnualReturn";
import UploadRecord from "@/models/UploadRecord";
import { buildInvoiceCoverageSummary, type InvoiceCoverageInput } from "@/lib/invoiceCoverage";
import {
  categoryLabel,
  reportQuerySchema,
  type ReportBreakdownRow,
  type ReportBillingRateRow,
  type ReportClientRow,
  type ReportCreditType,
  type ReportPaymentStatus,
  type ReportQuery,
  type ReportQuotationItem,
  type ReportQuotationRow,
  type ReportResponse,
} from "@/lib/reporting";

type FlatRecord = Record<string, unknown>;

const CATEGORY_IDS = ["1", "2", "3", "4"] as const;
const CREDIT_TYPES: ReportCreditType[] = ["RECYCLING", "EOL"];

export type ReportDataSection = "financial-years" | "transactions" | "quotations" | "billing" | "payments" | "invoices" | "annual-returns" | "uploads";

function numberValue(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function isoDate(value: unknown) {
  if (!value) return "";
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function getLegalName(client: FlatRecord) {
  const direct = textValue(client.legalName).trim();
  if (direct) return direct;
  const customFields = client.customFields;
  if (!customFields || typeof customFields !== "object" || Array.isArray(customFields)) return "";
  return textValue((customFields as FlatRecord).legalName).trim();
}

function normalizeType(value: unknown): ReportCreditType {
  return textValue(value).toUpperCase() === "EOL" ? "EOL" : "RECYCLING";
}

export function normalizeCategoryId(value: unknown) {
  const raw = textValue(value).trim();
  if (/^[1-4]$/.test(raw)) return raw;
  const match = raw.match(/(?:CAT(?:EGORY)?[- _]?)(IV|III|II|I|[1-4])/i);
  if (!match) return "";
  const roman: Record<string, string> = { I: "1", II: "2", III: "3", IV: "4" };
  const token = match[1].toUpperCase();
  return roman[token] || token;
}

function structuredEntryValue(
  record: FlatRecord | undefined,
  field: "targets" | "generated",
  categoryId: string,
  type: ReportCreditType,
) {
  if (!record) return 0;
  const entries = Array.isArray(record[field]) ? record[field] as FlatRecord[] : [];
  if (entries.length > 0) {
    return entries.reduce((sum, entry) => (
      textValue(entry.categoryId) === categoryId && normalizeType(entry.type) === type
        ? sum + numberValue(entry.value)
        : sum
    ), 0);
  }

  // Legacy records only contained one value per category. It represented Recycling.
  if (type === "EOL") return 0;
  const index = Number(categoryId);
  const canonical = field === "targets" ? `cat${index}Target` : `cat${index}Generated`;
  const legacy = field === "targets" ? `targetCat${index}` : `creditsCat${index}`;
  if (Object.prototype.hasOwnProperty.call(record, canonical)) return numberValue(record[canonical]);
  return numberValue(record[legacy]);
}

function transactionCategoryValue(record: FlatRecord, categoryId: string) {
  const canonical = `cat${categoryId}Qty`;
  const legacy = `cat${categoryId}`;
  if (Object.prototype.hasOwnProperty.call(record, canonical)) return numberValue(record[canonical]);
  return numberValue(record[legacy]);
}

function quotationAcceptedAt(quotation: FlatRecord) {
  const explicit = quotation.acceptedAt;
  if (explicit) return isoDate(explicit);
  const activities = Array.isArray(quotation.activities) ? quotation.activities as FlatRecord[] : [];
  const accepted = activities
    .filter((activity) => textValue(activity.action).toLowerCase().includes("accepted"))
    .map((activity) => isoDate(activity.timestamp))
    .filter(Boolean)
    .sort();
  return accepted[0] || "";
}

function quotationDate(quotation: FlatRecord, field: ReportQuery["dateField"]) {
  if (field === "sent") return isoDate(quotation.sentAt);
  if (field === "accepted") return quotationAcceptedAt(quotation);
  return isoDate(quotation.createdAt);
}

function dateMatches(value: string, from: string, to: string) {
  if (!from && !to) return true;
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return false;
  if (from) {
    const lower = new Date(`${from}T00:00:00.000`).getTime();
    if (!Number.isNaN(lower) && timestamp < lower) return false;
  }
  if (to) {
    const upper = new Date(`${to}T23:59:59.999`).getTime();
    if (!Number.isNaN(upper) && timestamp > upper) return false;
  }
  return true;
}

function quotationMatches(quotation: FlatRecord, query: ReportQuery) {
  if (query.quotationStatuses.length > 0 && !query.quotationStatuses.includes(textValue(quotation.status) as never)) return false;
  if (query.sentOnly && !quotation.sentAt) return false;
  return dateMatches(quotationDate(quotation, query.dateField), query.dateFrom, query.dateTo);
}

function revisionItem(item: FlatRecord): ReportQuotationItem {
  const categoryId = normalizeCategoryId(item.category);
  return {
    description: textValue(item.description),
    categoryId,
    categoryLabel: categoryLabel(categoryId),
    type: normalizeType(item.type),
    quantity: numberValue(item.quantity),
    rate: numberValue(item.rate),
    value: numberValue(item.totalAmount),
    mapped: Boolean(categoryId),
  };
}

function billingRateRows(billing: FlatRecord | undefined): ReportBillingRateRow[] {
  if (!Array.isArray(billing?.targetBreakdown)) return [];
  return (billing.targetBreakdown as FlatRecord[]).map((entry) => {
    const categoryId = normalizeCategoryId(entry.categoryId || entry.categoryLabel);
    return {
      categoryId,
      categoryLabel: categoryLabel(categoryId),
      type: normalizeType(entry.type),
      quantity: numberValue(entry.quantity),
      rate: numberValue(entry.rate),
    };
  }).filter((entry) => Boolean(entry.categoryId));
}

function selectedDimension(query: ReportQuery, categoryId: string, type: ReportCreditType) {
  return query.categoryIds.includes(categoryId as never) && query.targetTypes.includes(type);
}

function quotationRow(quotation: FlatRecord, revision: FlatRecord | undefined, query: ReportQuery): ReportQuotationRow {
  const items = (Array.isArray(revision?.items) ? revision.items as FlatRecord[] : [])
    .map(revisionItem)
    .filter((item) => !item.mapped || selectedDimension(query, item.categoryId, item.type));
  return {
    id: textValue(quotation._id),
    quotationNumber: textValue(quotation.quotationNumber) || "Draft",
    status: textValue(quotation.status),
    revisionNumber: numberValue(quotation.currentRevisionNumber),
    createdAt: isoDate(quotation.createdAt),
    sentAt: isoDate(quotation.sentAt),
    acceptedAt: quotationAcceptedAt(quotation),
    grandTotal: numberValue(revision?.grandTotal),
    revisionFinalised: Boolean(revision?.isFinalised),
    items,
  };
}

function paymentStatus(billingTotal: number, receivedTotal: number): ReportPaymentStatus {
  if (billingTotal <= 0) return "no-billing";
  if (receivedTotal <= 0) return "unpaid";
  if (receivedTotal + 0.005 >= billingTotal) return "paid";
  return "partial";
}

function matchNumeric(value: number, minimum?: number, maximum?: number) {
  if (minimum != null && value < minimum) return false;
  if (maximum != null && value > maximum) return false;
  return true;
}

function requiresQuotation(query: ReportQuery) {
  return query.view === "accepted-targets" || query.view === "quotations" || query.quotationStatuses.length > 0 || query.sentOnly || Boolean(query.dateFrom || query.dateTo);
}

function sortRows(rows: ReportClientRow[], query: ReportQuery) {
  const numericKeys = new Set<ReportQuery["sortBy"]>([
    "targetTotal", "quotedTotal", "achievedTotal", "remainingTotal", "acceptedValue", "pendingAmount", "achievementPercent",
  ]);
  const multiplier = query.sortDirection === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    if (query.sortBy === "companyName") return left.companyName.localeCompare(right.companyName) * multiplier;
    const key = query.sortBy === "acceptedValue" ? "acceptedQuotationValue" : query.sortBy;
    if (!numericKeys.has(query.sortBy)) return 0;
    return (numberValue(left[key as keyof ReportClientRow]) - numberValue(right[key as keyof ReportClientRow])) * multiplier;
  });
}

function countFacet(values: string[]) {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return Array.from(counts, ([value, count]) => ({ value, count })).sort((a, b) => a.value.localeCompare(b.value));
}

export async function buildReport(rawQuery: ReportQuery, options: {
  exportAll?: boolean;
  sections?: ReadonlySet<ReportDataSection>;
  customFieldKeys?: ReadonlySet<string>;
} = {}): Promise<ReportResponse> {
  const query = reportQuerySchema.parse(rawQuery);
  const include = (section: ReportDataSection) => !options.sections || options.sections.has(section);
  const clientMatch: FlatRecord = {};
  if (query.clientCategories.length > 0) clientMatch.category = { $in: query.clientCategories };
  if (query.states.length > 0) clientMatch.state = { $in: query.states };

  const clients = await Client.find(clientMatch).sort({ companyName: 1 }).lean() as FlatRecord[];
  const clientIds = clients.map((client) => textValue(client.clientId)).filter(Boolean);

  const [
    financialYears,
    transactions,
    quotations,
    billings,
    payments,
    invoices,
    annualReturns,
    uploads,
    unlinkedQuotations,
  ] = await Promise.all([
    include("financial-years") ? FinancialYear.find({ clientId: { $in: clientIds }, financialYear: query.financialYear }).lean() as Promise<FlatRecord[]> : Promise.resolve([] as FlatRecord[]),
    include("transactions") ? CreditTransaction.find({ financialYear: query.financialYear, $or: [{ toClientId: { $in: clientIds } }, { fromClientId: { $in: clientIds } }] }).lean() as Promise<FlatRecord[]> : Promise.resolve([] as FlatRecord[]),
    include("quotations") ? Quotation.find({ financialYear: query.financialYear, clientId: { $in: clientIds } }).lean() as Promise<FlatRecord[]> : Promise.resolve([] as FlatRecord[]),
    include("billing") ? Billing.find({ clientId: { $in: clientIds }, financialYear: query.financialYear }).lean() as Promise<FlatRecord[]> : Promise.resolve([] as FlatRecord[]),
    include("payments") ? Payment.find({ clientId: { $in: clientIds }, financialYear: query.financialYear }).lean() as Promise<FlatRecord[]> : Promise.resolve([] as FlatRecord[]),
    include("invoices") ? Invoice.find({ clientId: { $in: clientIds }, financialYear: query.financialYear }).lean() as Promise<FlatRecord[]> : Promise.resolve([] as FlatRecord[]),
    include("annual-returns") ? AnnualReturn.find({ clientId: { $in: clientIds }, financialYear: query.financialYear }).lean() as Promise<FlatRecord[]> : Promise.resolve([] as FlatRecord[]),
    include("uploads") ? UploadRecord.find({ clientId: { $in: clientIds }, financialYear: query.financialYear }).lean() as Promise<FlatRecord[]> : Promise.resolve([] as FlatRecord[]),
    include("quotations") ? Quotation.countDocuments({ financialYear: query.financialYear, $or: [{ clientId: "" }, { clientId: { $exists: false } }, { clientId: null }] }) : Promise.resolve(0),
  ]);

  const quotationIds = quotations.map((quotation) => textValue(quotation._id));
  const revisions = quotationIds.length > 0 ? await QuotationRevision.find({ quotationId: { $in: quotationIds } }).lean() as FlatRecord[] : [];
  const revisionMap = new Map(revisions.map((revision) => [
    `${textValue(revision.quotationId)}:${numberValue(revision.revisionNumber)}`,
    revision,
  ]));

  const financialYearMap = new Map(financialYears.map((record) => [textValue(record.clientId), record]));
  const annualReturnMap = new Map(annualReturns.map((record) => [textValue(record.clientId), record]));
  const groupByClient = (records: FlatRecord[], field = "clientId") => {
    const map = new Map<string, FlatRecord[]>();
    records.forEach((record) => {
      const id = textValue(record[field]);
      if (!id) return;
      map.set(id, [...(map.get(id) || []), record]);
    });
    return map;
  };
  const quotationMap = groupByClient(quotations);
  const billingMap = groupByClient(billings);
  const paymentsMap = groupByClient(payments);
  const invoicesMap = groupByClient(invoices);
  const uploadsMap = groupByClient(uploads);
  const transactionToMap = groupByClient(transactions, "toClientId");
  const transactionFromMap = groupByClient(transactions, "fromClientId");

  let unmappedQuotationItems = 0;
  const candidateRows: ReportClientRow[] = [];

  for (const client of clients) {
    const clientId = textValue(client.clientId);
    const allClientQuotations = quotationMap.get(clientId) || [];
    const matchingQuotationRecords = allClientQuotations.filter((quotation) => quotationMatches(quotation, query));
    if (requiresQuotation(query) && matchingQuotationRecords.length === 0) continue;

    const reportQuotations = matchingQuotationRecords.map((quotation) => quotationRow(
      quotation,
      revisionMap.get(`${textValue(quotation._id)}:${numberValue(quotation.currentRevisionNumber)}`),
      query,
    ));
    const acceptedQuotationRows = reportQuotations.filter((quotation) => quotation.status === "Accepted");
    const fyRecord = financialYearMap.get(clientId);
    const inboundTransactions = transactionToMap.get(clientId) || [];
    const outboundTransactions = transactionFromMap.get(clientId) || [];
    const breakdown: ReportBreakdownRow[] = [];

    for (const categoryId of CATEGORY_IDS) {
      for (const type of CREDIT_TYPES) {
        if (!selectedDimension(query, categoryId, type)) continue;
        const target = structuredEntryValue(fyRecord, "targets", categoryId, type);
        const quoted = acceptedQuotationRows.reduce((total, quotation) => total + quotation.items.reduce((itemTotal, item) => (
          item.mapped && item.categoryId === categoryId && item.type === type ? itemTotal + item.quantity : itemTotal
        ), 0), 0);
        const achieved = inboundTransactions.reduce((total, transaction) => (
          normalizeType(transaction.creditType) === type ? total + transactionCategoryValue(transaction, categoryId) : total
        ), 0);
        const remaining = target - achieved;
        breakdown.push({
          categoryId,
          categoryLabel: categoryLabel(categoryId),
          type,
          target,
          quoted,
          achieved,
          remaining,
          achievementPercent: target > 0 ? (achieved / target) * 100 : 0,
        });
      }
    }

    reportQuotations.forEach((quotation) => quotation.items.forEach((item) => {
      if (!item.mapped) unmappedQuotationItems += 1;
    }));

    const sumBreakdown = (field: "target" | "quoted" | "achieved" | "remaining", type?: ReportCreditType) => breakdown.reduce(
      (sum, entry) => sum + (!type || entry.type === type ? entry[field] : 0),
      0,
    );
    const targetTotal = sumBreakdown("target");
    const quotedTotal = sumBreakdown("quoted");
    const achievedTotal = sumBreakdown("achieved");
    const remainingTotal = targetTotal - achievedTotal;
    const clientBillings = billingMap.get(clientId) || [];
    const annualBilling = clientBillings.find((entry) => textValue(entry.billType) !== "general");
    const billingTotal = clientBillings.reduce((sum, entry) => sum + numberValue(entry.totalAmount), 0);
    const receivedTotal = (paymentsMap.get(clientId) || []).reduce((sum, payment) => sum + numberValue(payment.amountPaid), 0);
    const pendingAmount = billingTotal - receivedTotal;
    const currentPaymentStatus = paymentStatus(billingTotal, receivedTotal);
    const clientUploads = uploadsMap.get(clientId) || [];
    const uploadQuantity = clientUploads.reduce((sum, upload) => sum + CATEGORY_IDS.reduce((catSum, id) => catSum + numberValue(upload[`cat${id}`]), 0), 0);
    const uploadInvoiceCount = clientUploads.reduce((sum, upload) => sum + numberValue(upload.invoiceCount), 0);
    const generatedCredits = query.categoryIds.reduce((sum, categoryId) => sum + query.targetTypes.reduce(
      (typeSum, type) => typeSum + structuredEntryValue(fyRecord, "generated", categoryId, type), 0,
    ), 0);
    const soldCredits = outboundTransactions.reduce((sum, transaction) => {
      const type = normalizeType(transaction.creditType);
      if (!query.targetTypes.includes(type)) return sum;
      return sum + query.categoryIds.reduce((catSum, id) => catSum + transactionCategoryValue(transaction, id), 0);
    }, 0);

    const annualReturnStatus = textValue(annualReturnMap.get(clientId)?.status) || "Not recorded";
    const clientInvoices = invoicesMap.get(clientId) || [];
    const invoiceCoverage = buildInvoiceCoverageSummary(clientInvoices as InvoiceCoverageInput[], query.financialYear);
    const invoiceMonthsReceived = invoiceCoverage.sale.doneCount + invoiceCoverage.purchase.doneCount;
    const acceptedQuotations = acceptedQuotationRows;
    const clientCustomFields = client.customFields && typeof client.customFields === "object" && !Array.isArray(client.customFields)
      ? client.customFields as FlatRecord
      : {};
    const selectedCustomFields = options.customFieldKeys && options.customFieldKeys.size > 0
      ? Object.fromEntries(Array.from(options.customFieldKeys, (key) => {
        const value = clientCustomFields[key];
        return [key, typeof value === "boolean" || typeof value === "number" || typeof value === "string" ? value : null];
      }))
      : null;
    const row: ReportClientRow = {
      clientId,
      companyName: textValue(client.companyName),
      legalName: getLegalName(client),
      clientCategory: textValue(client.category),
      state: textValue(client.state),
      gstNumber: textValue(client.gstNumber),
      registrationNumber: textValue(client.registrationNumber),
      clientCreatedAt: isoDate(client.createdAt),
      ...(selectedCustomFields ? { customFields: selectedCustomFields } : {}),
      financialYear: query.financialYear,
      financialYearRecorded: Boolean(fyRecord),
      quotationCount: reportQuotations.length,
      sentQuotationCount: reportQuotations.filter((quotation) => Boolean(quotation.sentAt)).length,
      acceptedQuotationCount: acceptedQuotations.length,
      acceptedQuotationValue: acceptedQuotations.reduce((sum, quotation) => sum + quotation.grandTotal, 0),
      quotationValue: reportQuotations.reduce((sum, quotation) => sum + quotation.grandTotal, 0),
      targetTotal,
      targetRecycling: sumBreakdown("target", "RECYCLING"),
      targetEol: sumBreakdown("target", "EOL"),
      quotedTotal,
      quotedRecycling: sumBreakdown("quoted", "RECYCLING"),
      quotedEol: sumBreakdown("quoted", "EOL"),
      achievedTotal,
      achievedRecycling: sumBreakdown("achieved", "RECYCLING"),
      achievedEol: sumBreakdown("achieved", "EOL"),
      generatedCredits,
      soldCredits,
      inboundTransactionCount: inboundTransactions.length,
      outboundTransactionCount: outboundTransactions.length,
      remainingCredits: generatedCredits - soldCredits,
      remainingTotal,
      remainingRecycling: sumBreakdown("remaining", "RECYCLING"),
      remainingEol: sumBreakdown("remaining", "EOL"),
      achievementPercent: targetTotal > 0 ? (achievedTotal / targetTotal) * 100 : 0,
      billingTotal,
      receivedTotal,
      paymentCount: (paymentsMap.get(clientId) || []).length,
      pendingAmount,
      paymentStatus: currentPaymentStatus,
      billingCreated: Boolean(annualBilling),
      billingInvoiceCreated: Boolean(annualBilling?.invoiceCreated),
      annualReturnStatus,
      invoiceCount: clientInvoices.length,
      invoiceSaleMonthsReceived: invoiceCoverage.sale.doneCount,
      invoicePurchaseMonthsReceived: invoiceCoverage.purchase.doneCount,
      invoiceCoveragePercent: (invoiceMonthsReceived / 24) * 100,
      uploadQuantity,
      uploadInvoiceCount,
      uploadRecordCount: clientUploads.length,
      breakdown,
      quotations: reportQuotations,
      billingTargetBreakdown: billingRateRows(annualBilling),
      warnings: [
        ...(reportQuotations.some((quotation) => quotation.items.some((item) => !item.mapped)) ? ["Some quotation items could not be mapped to CAT-I–IV"] : []),
        ...(query.view === "accepted-targets" && targetTotal <= 0 ? ["No target recorded for the selected dimensions"] : []),
      ],
    };

    const searchable = [row.clientId, row.companyName, row.legalName, row.clientCategory, row.state, ...row.quotations.map((quotation) => quotation.quotationNumber)]
      .join(" ").toLowerCase();
    if (query.search && !searchable.includes(query.search.toLowerCase())) continue;
    if (query.hasTarget === "yes" && targetTotal <= 0) continue;
    if (query.hasTarget === "no" && targetTotal > 0) continue;
    if (query.paymentStatus !== "all" && currentPaymentStatus !== query.paymentStatus) continue;
    if (query.annualReturnStatuses.length > 0 && !query.annualReturnStatuses.includes(annualReturnStatus)) continue;
    if (!matchNumeric(targetTotal, query.minTarget, query.maxTarget)) continue;
    if (!matchNumeric(remainingTotal, query.minRemaining, query.maxRemaining)) continue;
    if (!matchNumeric(row.achievementPercent, query.minAchievement, query.maxAchievement)) continue;
    if (!query.includeZero && targetTotal === 0 && quotedTotal === 0 && achievedTotal === 0 && billingTotal === 0 && uploadQuantity === 0) continue;
    candidateRows.push(row);
  }

  const sortedRows = sortRows(candidateRows, query);
  const totalRows = sortedRows.length;
  const exportRows = options.exportAll
    ? sortedRows
    : sortedRows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
  const summary = sortedRows.reduce((totals, row) => ({
    matchedClients: totals.matchedClients + 1,
    matchingQuotations: totals.matchingQuotations + row.quotationCount,
    acceptedQuotations: totals.acceptedQuotations + row.acceptedQuotationCount,
    acceptedQuotationValue: totals.acceptedQuotationValue + row.acceptedQuotationValue,
    targetTotal: totals.targetTotal + row.targetTotal,
    quotedTotal: totals.quotedTotal + row.quotedTotal,
    achievedTotal: totals.achievedTotal + row.achievedTotal,
    remainingTotal: totals.remainingTotal + row.remainingTotal,
    generatedCredits: totals.generatedCredits + row.generatedCredits,
    soldCredits: totals.soldCredits + row.soldCredits,
    remainingCredits: totals.remainingCredits + row.remainingCredits,
    achievementPercent: 0,
    billingTotal: totals.billingTotal + row.billingTotal,
    receivedTotal: totals.receivedTotal + row.receivedTotal,
    pendingAmount: totals.pendingAmount + row.pendingAmount,
    annualReturnRecorded: totals.annualReturnRecorded + (row.annualReturnStatus === "Not recorded" ? 0 : 1),
    invoiceRecords: totals.invoiceRecords + row.invoiceCount,
    uploadQuantity: totals.uploadQuantity + row.uploadQuantity,
    uploadInvoiceCount: totals.uploadInvoiceCount + row.uploadInvoiceCount,
  }), {
    matchedClients: 0,
    matchingQuotations: 0,
    acceptedQuotations: 0,
    acceptedQuotationValue: 0,
    targetTotal: 0,
    quotedTotal: 0,
    achievedTotal: 0,
    remainingTotal: 0,
    generatedCredits: 0,
    soldCredits: 0,
    remainingCredits: 0,
    achievementPercent: 0,
    billingTotal: 0,
    receivedTotal: 0,
    pendingAmount: 0,
    annualReturnRecorded: 0,
    invoiceRecords: 0,
    uploadQuantity: 0,
    uploadInvoiceCount: 0,
  });
  summary.achievementPercent = summary.targetTotal > 0 ? (summary.achievedTotal / summary.targetTotal) * 100 : 0;

  const categoryComparison = CATEGORY_IDS.flatMap((categoryId) => CREDIT_TYPES
    .filter((type) => selectedDimension(query, categoryId, type))
    .map((type) => {
      const entries = sortedRows.flatMap((row) => row.breakdown).filter((entry) => entry.categoryId === categoryId && entry.type === type);
      return {
        name: `${categoryLabel(categoryId)} ${type === "EOL" ? "EOL" : "Recycling"}`,
        categoryId,
        type,
        target: entries.reduce((sum, entry) => sum + entry.target, 0),
        quoted: entries.reduce((sum, entry) => sum + entry.quoted, 0),
        achieved: entries.reduce((sum, entry) => sum + entry.achieved, 0),
        remaining: entries.reduce((sum, entry) => sum + entry.remaining, 0),
      };
    }));
  const clientComparison = [...sortedRows]
    .sort((a, b) => {
      if (query.view === "billing") return Math.abs(b.pendingAmount) - Math.abs(a.pendingAmount);
      if (query.view === "credits") return Math.abs(b.remainingCredits) - Math.abs(a.remainingCredits);
      if (query.view === "uploads") return b.uploadQuantity - a.uploadQuantity;
      return Math.abs(b.remainingTotal) - Math.abs(a.remainingTotal);
    })
    .slice(0, query.topN)
    .map((row) => ({
      clientId: row.clientId,
      name: row.companyName.length > 24 ? `${row.companyName.slice(0, 22)}…` : row.companyName,
      target: row.targetTotal,
      quoted: row.quotedTotal,
      achieved: row.achievedTotal,
      remaining: row.remainingTotal,
      generated: row.generatedCredits,
      sold: row.soldCredits,
      remainingCredits: row.remainingCredits,
      billed: row.billingTotal,
      received: row.receivedTotal,
      pending: row.pendingAmount,
      uploadQuantity: row.uploadQuantity,
    }));
  const statusValues = sortedRows.flatMap((row) => row.quotations.map((quotation) => quotation.status));

  const qualityMessages = [
    ...(unlinkedQuotations > 0 ? [`${unlinkedQuotations} quotation${unlinkedQuotations === 1 ? " is" : "s are"} not linked to a saved client and cannot be joined to targets.`] : []),
    ...(unmappedQuotationItems > 0 ? [`${unmappedQuotationItems} quotation item${unmappedQuotationItems === 1 ? " has" : "s have"} an unmapped category.`] : []),
  ];

  return {
    query,
    rows: exportRows,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalRows,
      totalPages: Math.max(1, Math.ceil(totalRows / query.pageSize)),
    },
    summary,
    charts: {
      categoryComparison,
      clientComparison,
      composition: [
        { name: "Recycling", value: sortedRows.reduce((sum, row) => sum + row.targetRecycling, 0) },
        { name: "EOL", value: sortedRows.reduce((sum, row) => sum + row.targetEol, 0) },
      ],
      quotationStatuses: countFacet(statusValues).map(({ value, count }) => ({ name: value, value: count })),
      annualReturnStatuses: countFacet(sortedRows.map((row) => row.annualReturnStatus)).map(({ value, count }) => ({ name: value, value: count })),
    },
    facets: {
      categories: countFacet(clients.map((client) => textValue(client.category))),
      states: countFacet(clients.map((client) => textValue(client.state))),
      quotationStatuses: countFacet(quotations.map((quotation) => textValue(quotation.status))),
      annualReturnStatuses: countFacet(annualReturns.map((record) => textValue(record.status) || "Not recorded")),
    },
    quality: { unlinkedQuotations, unmappedQuotationItems, messages: qualityMessages },
  };
}
