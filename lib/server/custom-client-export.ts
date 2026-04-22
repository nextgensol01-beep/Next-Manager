import { CURRENT_FY, FINANCIAL_YEARS } from "@/lib/utils";
import Client from "@/models/Client";
import FinancialYear from "@/models/FinancialYear";
import CreditTransaction from "@/models/CreditTransaction";
import Billing from "@/models/Billing";
import Payment from "@/models/Payment";
import AnnualReturn from "@/models/AnnualReturn";
import Invoice from "@/models/Invoice";
import UploadRecord from "@/models/UploadRecord";
import Document from "@/models/Document";
import EmailLog from "@/models/EmailLog";
import {
  CUSTOM_CLIENT_EXPORT_FIELDS,
  CUSTOM_EXPORT_CLIENT_CATEGORIES,
  type CustomClientExportField,
  type CustomClientExportFieldDefinition,
  type CustomExportClientCategory,
  type CustomExportSortBy,
} from "@/lib/reports";
import { getClientContactsMap } from "@/lib/server/client-contact-service";

type CreditBreakupType = "RECYCLING" | "EOL";
type FlatRecord = Record<string, unknown>;
type ExportValue = string | number;
type LinkedContactSummary = {
  name: string;
  designation: string;
  selectedPhones: string[];
  selectedEmails: string[];
  isPrimaryContact: boolean;
};

export type CustomClientExportRequest = {
  fields: CustomClientExportField[];
  fy?: string;
  categories?: CustomExportClientCategory[];
  clientIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  includeOnlyNonEmpty?: boolean;
  sortBy?: CustomExportSortBy;
};

export type CustomClientExportPreviewColumn = {
  id: CustomClientExportField;
  label: string;
  group: string;
  fyScoped: boolean;
  nonEmptyCount: number;
};

export type CustomClientExportSummary = {
  matchedClients: number;
  withContacts: number;
  withBilling: number;
  withPayments: number;
  withDocuments: number;
  withEmails: number;
  withAnnualReturn: number;
};

export type CustomClientExportResult = {
  fy: string;
  fields: CustomClientExportField[];
  rows: Array<Record<string, ExportValue>>;
  previewColumns: CustomClientExportPreviewColumn[];
  summary: CustomClientExportSummary;
};

const VALID_CATEGORY_SET = new Set<string>(CUSTOM_EXPORT_CLIENT_CATEGORIES);

function normalizeCreditType(value: unknown): CreditBreakupType {
  return String(value || "").toUpperCase() === "EOL" ? "EOL" : "RECYCLING";
}

function formatDate(value: unknown): string {
  if (!value) return "";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-IN");
}

function toTimestamp(value: unknown): number {
  if (!value) return 0;
  const ts = new Date(String(value)).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function joinUnique(values: Array<string | null | undefined>): string {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean))).join(", ");
}

function sumNumbers(values: unknown[]): number {
  return values.reduce<number>((sum, value) => sum + (Number(value) || 0), 0);
}

export function getFieldConfig(field: CustomClientExportField): CustomClientExportFieldDefinition | undefined {
  return CUSTOM_CLIENT_EXPORT_FIELDS.find((entry) => entry.id === field);
}

function parseDateInput(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isDateInRange(value: unknown, start: Date | null, end: Date | null): boolean {
  const ts = toTimestamp(value);
  if (!ts) return false;
  if (start && ts < start.getTime()) return false;
  if (end && ts > end.getTime()) return false;
  return true;
}

function invoiceMatchesRange(invoice: FlatRecord, start: Date | null, end: Date | null): boolean {
  if (!start && !end) return true;
  const fromTs = toTimestamp(invoice.fromDate);
  const toTs = toTimestamp(invoice.toDate);
  if (!fromTs && !toTs) return false;
  if (start && toTs && toTs < start.getTime()) return false;
  if (end && fromTs && fromTs > end.getTime()) return false;
  return true;
}

function sumTypedFinancialTotals(
  record: FlatRecord | null,
  fieldName: "generated" | "targets",
  flatPrefix: "cat",
  flatSuffix: "Generated" | "Target",
  legacyPrefix: "creditsCat" | "targetCat",
  type?: CreditBreakupType,
): number {
  if (!record) return 0;

  const entries = Array.isArray(record[fieldName]) ? record[fieldName] as FlatRecord[] : [];
  if (entries.length > 0) {
    return entries.reduce<number>((sum, entry) => {
      const entryType = normalizeCreditType(entry.type);
      if (type && entryType !== type) return sum;
      return sum + (Number(entry.value) || 0);
    }, 0);
  }

  if (type === "EOL") return 0;

  return [1, 2, 3, 4].reduce<number>((sum, category) => {
    const flatKey = `${flatPrefix}${category}${flatSuffix}`;
    const legacyKey = `${legacyPrefix}${category}`;
    return sum + (Number(record[flatKey] ?? record[legacyKey]) || 0);
  }, 0);
}

function getLatestByDate<T extends FlatRecord>(records: T[], field: string): T | null {
  if (records.length === 0) return null;
  return [...records].sort((a, b) => toTimestamp(b[field]) - toTimestamp(a[field]))[0] || null;
}

function buildContactSummary(contacts: LinkedContactSummary[]) {
  const primary = contacts.find((contact) => contact.isPrimaryContact) || contacts[0] || null;

  return {
    contactCount: contacts.length,
    primaryContactName: primary?.name || "",
    primaryContactDesignation: primary?.designation || "",
    primaryContactPhones: joinUnique(primary?.selectedPhones || []),
    primaryContactEmails: joinUnique(primary?.selectedEmails || []),
    allContactNames: joinUnique(contacts.map((contact) => contact.name)),
    allContactDesignations: joinUnique(contacts.map((contact) => contact.designation)),
    allSelectedPhones: joinUnique(contacts.flatMap((contact) => contact.selectedPhones || [])),
    allSelectedEmails: joinUnique(contacts.flatMap((contact) => contact.selectedEmails || [])),
  };
}

function buildPaymentSummary(billing: FlatRecord | null, payments: FlatRecord[]) {
  const billingPaid = payments.reduce<number>(
    (sum, payment) => sum + (payment.paymentType === "advance" ? 0 : (Number(payment.amountPaid) || 0)),
    0
  );
  const advancePaid = payments.reduce<number>(
    (sum, payment) => sum + (payment.paymentType === "advance" ? (Number(payment.amountPaid) || 0) : 0),
    0
  );
  const totalReceived = billingPaid + advancePaid;
  const totalBilled = Number(billing?.totalAmount) || 0;
  const latestPayment = getLatestByDate(payments, "paymentDate");

  return {
    fyBillingTotal: totalBilled,
    fyBillingGovtCharges: Number(billing?.govtCharges) || 0,
    fyBillingConsultancyCharges: Number(billing?.consultancyCharges) || 0,
    fyBillingTargetCharges: Number(billing?.targetCharges) || 0,
    fyBillingOtherCharges: Number(billing?.otherCharges) || 0,
    fyBillingNotes: String(billing?.notes || ""),
    fyBillingPaid: billingPaid,
    fyAdvancePaid: advancePaid,
    fyTotalReceived: totalReceived,
    fyPendingAmount: Math.max(0, totalBilled - billingPaid),
    fyPaymentCount: payments.length,
    fyLatestPaymentDate: formatDate(latestPayment?.paymentDate),
    fyPaymentModes: joinUnique(payments.map((payment) => String(payment.paymentMode || ""))),
    __latestPaymentTs: toTimestamp(latestPayment?.paymentDate),
    __hasBilling: Boolean(billing),
    __hasPayments: payments.length > 0,
  };
}

function buildUploadSummary(uploads: FlatRecord[]) {
  const latestUpload = getLatestByDate(uploads, "createdAt");
  const fyUploadedCat1 = sumNumbers(uploads.map((upload) => upload.cat1));
  const fyUploadedCat2 = sumNumbers(uploads.map((upload) => upload.cat2));
  const fyUploadedCat3 = sumNumbers(uploads.map((upload) => upload.cat3));
  const fyUploadedCat4 = sumNumbers(uploads.map((upload) => upload.cat4));

  return {
    fyUploadRecordCount: uploads.length,
    fyUploadedCat1,
    fyUploadedCat2,
    fyUploadedCat3,
    fyUploadedCat4,
    fyUploadedTotal: fyUploadedCat1 + fyUploadedCat2 + fyUploadedCat3 + fyUploadedCat4,
    fyLatestUploadDate: formatDate(latestUpload?.createdAt),
    __latestUploadTs: toTimestamp(latestUpload?.createdAt),
  };
}

function buildDocumentSummary(documents: FlatRecord[]) {
  const latestDocument = getLatestByDate(documents, "uploadedDate") || getLatestByDate(documents, "createdAt");
  return {
    documentCount: documents.length,
    latestDocumentName: String(latestDocument?.documentName || ""),
    latestDocumentLink: String(latestDocument?.driveLink || ""),
    latestDocumentDate: formatDate(latestDocument?.uploadedDate || latestDocument?.createdAt),
    __latestDocumentTs: toTimestamp(latestDocument?.uploadedDate || latestDocument?.createdAt),
    __hasDocuments: documents.length > 0,
  };
}

function buildEmailSummary(emailLogs: FlatRecord[], fy: string) {
  const latestEmail = getLatestByDate(emailLogs, "sentAt");
  return {
    emailCount: emailLogs.length,
    fyEmailCount: emailLogs.filter((email) => String(email.financialYear || "") === fy).length,
    lastEmailSubject: String(latestEmail?.subject || ""),
    lastEmailStatus: String(latestEmail?.status || ""),
    lastEmailType: String(latestEmail?.type || ""),
    lastEmailDate: formatDate(latestEmail?.sentAt),
    lastEmailRecipients: joinUnique(Array.isArray(latestEmail?.to) ? latestEmail.to as string[] : []),
    __latestEmailTs: toTimestamp(latestEmail?.sentAt),
    __hasEmails: emailLogs.length > 0,
  };
}

function buildFinancialSummary(
  financialYear: FlatRecord | null,
  soldTotals: Record<CreditBreakupType, number>,
  achievedTotals: Record<CreditBreakupType, number>,
) {
  const fyGeneratedRecyclingTotal = sumTypedFinancialTotals(financialYear, "generated", "cat", "Generated", "creditsCat", "RECYCLING");
  const fyGeneratedEolTotal = sumTypedFinancialTotals(financialYear, "generated", "cat", "Generated", "creditsCat", "EOL");
  const fyTargetRecyclingTotal = sumTypedFinancialTotals(financialYear, "targets", "cat", "Target", "targetCat", "RECYCLING");
  const fyTargetEolTotal = sumTypedFinancialTotals(financialYear, "targets", "cat", "Target", "targetCat", "EOL");
  const fyGeneratedTotal = fyGeneratedRecyclingTotal + fyGeneratedEolTotal;
  const fySoldRecyclingTotal = soldTotals.RECYCLING;
  const fySoldEolTotal = soldTotals.EOL;
  const fySoldTotal = fySoldRecyclingTotal + fySoldEolTotal;
  const fyAchievedRecyclingTotal = achievedTotals.RECYCLING;
  const fyAchievedEolTotal = achievedTotals.EOL;
  const fyAchievedTotal = fyAchievedRecyclingTotal + fyAchievedEolTotal;
  const fyTargetTotal = fyTargetRecyclingTotal + fyTargetEolTotal;

  return {
    fyGeneratedRecyclingTotal,
    fyGeneratedEolTotal,
    fyGeneratedTotal,
    fySoldRecyclingTotal,
    fySoldEolTotal,
    fySoldTotal,
    fyRemainingCredits: fyGeneratedTotal - fySoldTotal,
    fyTargetRecyclingTotal,
    fyTargetEolTotal,
    fyTargetTotal,
    fyAchievedRecyclingTotal,
    fyAchievedEolTotal,
    fyAchievedTotal,
    fyRemainingTargetTotal: fyTargetTotal - fyAchievedTotal,
  };
}

function normalizeRequest(request: CustomClientExportRequest) {
  const fy = typeof request.fy === "string" && FINANCIAL_YEARS.includes(request.fy)
    ? request.fy
    : CURRENT_FY;
  const fields = Array.from(new Set<CustomClientExportField>(request.fields || []));
  const categories = Array.from(
    new Set(
      (request.categories || []).filter((category): category is CustomExportClientCategory => (
        typeof category === "string" && VALID_CATEGORY_SET.has(category)
      ))
    )
  );
  const clientIds = Array.from(new Set((request.clientIds || []).map((id) => id.trim()).filter(Boolean)));
  const dateFrom = parseDateInput(request.dateFrom);
  const dateTo = parseDateInput(request.dateTo);

  return {
    fy,
    fields,
    categories,
    clientIds,
    dateFrom,
    dateTo,
    includeOnlyNonEmpty: Boolean(request.includeOnlyNonEmpty),
    sortBy: request.sortBy || "companyName",
  };
}

export async function buildCustomClientExportData(request: CustomClientExportRequest): Promise<CustomClientExportResult> {
  const options = normalizeRequest(request);
  if (options.fields.length === 0) {
    throw new Error("Select at least one field to export");
  }

  const clientQuery: Record<string, unknown> = {};
  if (options.categories.length > 0) {
    clientQuery.category = { $in: options.categories };
  }
  if (options.clientIds.length > 0) {
    clientQuery.clientId = { $in: options.clientIds };
  }

  const clients = await Client.find(clientQuery).sort({ companyName: 1 }).lean() as FlatRecord[];
  const clientIds = clients.map((client) => String(client.clientId || "")).filter(Boolean);

  if (clientIds.length === 0) {
    return {
      fy: options.fy,
      fields: options.fields,
      rows: [],
      previewColumns: options.fields.map((field) => {
        const config = getFieldConfig(field);
        return {
          id: field,
          label: config?.label || field,
          group: config?.group || "Other",
          fyScoped: Boolean(config?.fyScoped),
          nonEmptyCount: 0,
        };
      }),
      summary: {
        matchedClients: 0,
        withContacts: 0,
        withBilling: 0,
        withPayments: 0,
        withDocuments: 0,
        withEmails: 0,
        withAnnualReturn: 0,
      },
    };
  }

  const [
    contactsMap,
    financialYears,
    billings,
    paymentsRaw,
    annualReturns,
    invoicesRaw,
    uploads,
    documentsRaw,
    emailLogsRaw,
    txAgg,
  ] = await Promise.all([
    getClientContactsMap(clientIds),
    FinancialYear.find({ clientId: { $in: clientIds }, financialYear: options.fy }).lean() as Promise<FlatRecord[]>,
    Billing.find({ clientId: { $in: clientIds }, financialYear: options.fy }).lean() as Promise<FlatRecord[]>,
    Payment.find({ clientId: { $in: clientIds }, financialYear: options.fy }).lean() as Promise<FlatRecord[]>,
    AnnualReturn.find({ clientId: { $in: clientIds }, financialYear: options.fy }).lean() as Promise<FlatRecord[]>,
    Invoice.find({ clientId: { $in: clientIds }, financialYear: options.fy }).lean() as Promise<FlatRecord[]>,
    UploadRecord.find({ clientId: { $in: clientIds }, financialYear: options.fy }).lean() as Promise<FlatRecord[]>,
    Document.find({ clientId: { $in: clientIds } }).lean() as Promise<FlatRecord[]>,
    EmailLog.find({ clientId: { $in: clientIds } }).lean() as Promise<FlatRecord[]>,
    CreditTransaction.aggregate([
      {
        $match: {
          financialYear: options.fy,
          $or: [{ fromClientId: { $in: clientIds } }, { toClientId: { $in: clientIds } }],
        },
      },
      {
        $group: {
          _id: {
            from: "$fromClientId",
            to: "$toClientId",
            type: {
              $cond: [
                { $eq: [{ $toUpper: { $ifNull: ["$creditType", "RECYCLING"] } }, "EOL"] },
                "EOL",
                "RECYCLING",
              ],
            },
          },
          q1: { $sum: { $cond: [{ $gt: ["$cat1Qty", 0] }, "$cat1Qty", "$cat1"] } },
          q2: { $sum: { $cond: [{ $gt: ["$cat2Qty", 0] }, "$cat2Qty", "$cat2"] } },
          q3: { $sum: { $cond: [{ $gt: ["$cat3Qty", 0] }, "$cat3Qty", "$cat3"] } },
          q4: { $sum: { $cond: [{ $gt: ["$cat4Qty", 0] }, "$cat4Qty", "$cat4"] } },
        },
      },
    ]) as Promise<Array<{ _id: { from?: string; to?: string; type?: CreditBreakupType }; q1: number; q2: number; q3: number; q4: number }>>,
  ]);

  const payments = paymentsRaw.filter((payment) => isDateInRange(payment.paymentDate, options.dateFrom, options.dateTo) || (!options.dateFrom && !options.dateTo));
  const invoices = invoicesRaw.filter((invoice) => invoiceMatchesRange(invoice, options.dateFrom, options.dateTo));
  const documents = documentsRaw.filter((document) => (
    (!options.dateFrom && !options.dateTo) ||
    isDateInRange(document.uploadedDate || document.createdAt, options.dateFrom, options.dateTo)
  ));
  const emailLogs = emailLogsRaw.filter((email) => (
    (!options.dateFrom && !options.dateTo) ||
    isDateInRange(email.sentAt, options.dateFrom, options.dateTo)
  ));

  const financialYearMap = new Map(financialYears.map((record) => [String(record.clientId), record]));
  const billingMap = new Map(billings.map((record) => [String(record.clientId), record]));
  const annualReturnMap = new Map(annualReturns.map((record) => [String(record.clientId), record]));

  const paymentsMap = new Map<string, FlatRecord[]>();
  payments.forEach((payment) => {
    const clientId = String(payment.clientId || "");
    if (!clientId) return;
    const existing = paymentsMap.get(clientId) || [];
    existing.push(payment);
    paymentsMap.set(clientId, existing);
  });

  const invoicesMap = new Map<string, FlatRecord[]>();
  invoices.forEach((invoice) => {
    const clientId = String(invoice.clientId || "");
    if (!clientId) return;
    const existing = invoicesMap.get(clientId) || [];
    existing.push(invoice);
    invoicesMap.set(clientId, existing);
  });

  const uploadsMap = new Map<string, FlatRecord[]>();
  uploads.forEach((upload) => {
    const clientId = String(upload.clientId || "");
    if (!clientId) return;
    const existing = uploadsMap.get(clientId) || [];
    existing.push(upload);
    uploadsMap.set(clientId, existing);
  });

  const documentsMap = new Map<string, FlatRecord[]>();
  documents.forEach((document) => {
    const clientId = String(document.clientId || "");
    if (!clientId) return;
    const existing = documentsMap.get(clientId) || [];
    existing.push(document);
    documentsMap.set(clientId, existing);
  });

  const emailMap = new Map<string, FlatRecord[]>();
  emailLogs.forEach((email) => {
    const clientId = String(email.clientId || "");
    if (!clientId) return;
    const existing = emailMap.get(clientId) || [];
    existing.push(email);
    emailMap.set(clientId, existing);
  });

  const emptyTypedTotals = { RECYCLING: 0, EOL: 0 };
  const soldTotalsMap = new Map<string, Record<CreditBreakupType, number>>();
  const achievedTotalsMap = new Map<string, Record<CreditBreakupType, number>>();

  txAgg.forEach((tx) => {
    const totalQty = (Number(tx.q1) || 0) + (Number(tx.q2) || 0) + (Number(tx.q3) || 0) + (Number(tx.q4) || 0);
    const txType = normalizeCreditType(tx._id.type);

    const fromClientId = String(tx._id.from || "");
    if (fromClientId) {
      const current = soldTotalsMap.get(fromClientId) || { ...emptyTypedTotals };
      current[txType] += totalQty;
      soldTotalsMap.set(fromClientId, current);
    }

    const toClientId = String(tx._id.to || "");
    if (toClientId) {
      const current = achievedTotalsMap.get(toClientId) || { ...emptyTypedTotals };
      current[txType] += totalQty;
      achievedTotalsMap.set(toClientId, current);
    }
  });

  const entries = clients.map((client) => {
    const clientId = String(client.clientId || "");
    const contacts = (contactsMap.get(clientId) || []) as LinkedContactSummary[];
    const financialYear = financialYearMap.get(clientId) || null;
    const billing = billingMap.get(clientId) || null;
    const clientPayments = paymentsMap.get(clientId) || [];
    const annualReturn = annualReturnMap.get(clientId) || null;
    const clientInvoices = invoicesMap.get(clientId) || [];
    const clientUploads = uploadsMap.get(clientId) || [];
    const clientDocuments = documentsMap.get(clientId) || [];
    const clientEmails = emailMap.get(clientId) || [];
    const soldTotals = soldTotalsMap.get(clientId) || { ...emptyTypedTotals };
    const achievedTotals = achievedTotalsMap.get(clientId) || { ...emptyTypedTotals };
    const latestInvoice = getLatestByDate(clientInvoices, "createdAt");
    const contactSummary = buildContactSummary(contacts);
    const paymentSummary = buildPaymentSummary(billing, clientPayments);
    const uploadSummary = buildUploadSummary(clientUploads);
    const documentSummary = buildDocumentSummary(clientDocuments);
    const emailSummary = buildEmailSummary(clientEmails, options.fy);
    const financialSummary = buildFinancialSummary(financialYear, soldTotals, achievedTotals);
    const {
      __latestUploadTs,
      ...uploadExportSummary
    } = uploadSummary;
    const {
      __latestDocumentTs,
      __hasDocuments,
      ...documentExportSummary
    } = documentSummary;
    const {
      __latestEmailTs,
      __hasEmails,
      ...emailExportSummary
    } = emailSummary;

    const latestActivityTs = Math.max(
      toTimestamp(client.updatedAt),
      Number(paymentSummary.__latestPaymentTs || 0),
      Number(__latestUploadTs || 0),
      Number(__latestDocumentTs || 0),
      Number(__latestEmailTs || 0),
      toTimestamp(latestInvoice?.createdAt),
      toTimestamp(annualReturn?.updatedAt)
    );

    const exportValues: Record<string, ExportValue> = {
      companyName: String(client.companyName || ""),
      state: String(client.state || ""),
      gstNumber: String(client.gstNumber || ""),
      clientId,
      category: String(client.category || ""),
      registrationNumber: String(client.registrationNumber || ""),
      address: String(client.address || ""),
      cpcbLoginId: String(client.cpcbLoginId || ""),
      cpcbPassword: String(client.cpcbPassword || ""),
      otpMobileNumber: String(client.otpMobileNumber || ""),
      createdAt: formatDate(client.createdAt),
      updatedAt: formatDate(client.updatedAt),
      selectedFy: options.fy,
      ...contactSummary,
      ...financialSummary,
      fyBillingTotal: paymentSummary.fyBillingTotal,
      fyBillingGovtCharges: paymentSummary.fyBillingGovtCharges,
      fyBillingConsultancyCharges: paymentSummary.fyBillingConsultancyCharges,
      fyBillingTargetCharges: paymentSummary.fyBillingTargetCharges,
      fyBillingOtherCharges: paymentSummary.fyBillingOtherCharges,
      fyBillingNotes: paymentSummary.fyBillingNotes,
      fyBillingPaid: paymentSummary.fyBillingPaid,
      fyAdvancePaid: paymentSummary.fyAdvancePaid,
      fyTotalReceived: paymentSummary.fyTotalReceived,
      fyPendingAmount: paymentSummary.fyPendingAmount,
      fyPaymentCount: paymentSummary.fyPaymentCount,
      fyLatestPaymentDate: paymentSummary.fyLatestPaymentDate,
      fyPaymentModes: paymentSummary.fyPaymentModes,
      fyAnnualReturnStatus: String(annualReturn?.status || ""),
      fyAnnualReturnFilingDate: formatDate(annualReturn?.filingDate),
      fyAnnualReturnAckNumber: String(annualReturn?.acknowledgeNumber || ""),
      fyAnnualReturnRemarks: String(annualReturn?.remarks || ""),
      fyAnnualReturnUpdatedAt: formatDate(annualReturn?.updatedAt),
      fyInvoiceCount: clientInvoices.length,
      fyLatestInvoiceFromDate: formatDate(latestInvoice?.fromDate),
      fyLatestInvoiceToDate: formatDate(latestInvoice?.toDate),
      fyLatestInvoiceCreatedAt: formatDate(latestInvoice?.createdAt),
      ...uploadExportSummary,
      ...documentExportSummary,
      ...emailExportSummary,
    };

    return {
      exportValues,
      sortValues: {
        companyName: String(client.companyName || "").toLowerCase(),
        category: String(client.category || "").toLowerCase(),
        state: String(client.state || "").toLowerCase(),
        fyBillingTotal: Number(paymentSummary.fyBillingTotal) || 0,
        fyPendingAmount: Number(paymentSummary.fyPendingAmount) || 0,
        latestActivity: latestActivityTs,
        createdAt: toTimestamp(client.createdAt),
      },
      flags: {
        hasContacts: Number(contactSummary.contactCount) > 0,
        hasBilling: Boolean(paymentSummary.__hasBilling),
        hasPayments: Boolean(paymentSummary.__hasPayments),
        hasDocuments: Boolean(__hasDocuments),
        hasEmails: Boolean(__hasEmails),
        hasAnnualReturn: Boolean(annualReturn),
      },
    };
  });

  entries.sort((a, b) => {
    switch (options.sortBy) {
      case "category":
        return a.sortValues.category.localeCompare(b.sortValues.category) ||
          a.sortValues.companyName.localeCompare(b.sortValues.companyName);
      case "state":
        return a.sortValues.state.localeCompare(b.sortValues.state) ||
          a.sortValues.companyName.localeCompare(b.sortValues.companyName);
      case "fyBillingTotal":
        return b.sortValues.fyBillingTotal - a.sortValues.fyBillingTotal ||
          a.sortValues.companyName.localeCompare(b.sortValues.companyName);
      case "fyPendingAmount":
        return b.sortValues.fyPendingAmount - a.sortValues.fyPendingAmount ||
          a.sortValues.companyName.localeCompare(b.sortValues.companyName);
      case "latestActivity":
        return b.sortValues.latestActivity - a.sortValues.latestActivity ||
          a.sortValues.companyName.localeCompare(b.sortValues.companyName);
      case "createdAt":
        return b.sortValues.createdAt - a.sortValues.createdAt ||
          a.sortValues.companyName.localeCompare(b.sortValues.companyName);
      case "companyName":
      default:
        return a.sortValues.companyName.localeCompare(b.sortValues.companyName);
    }
  });

  const fieldStats = new Map<CustomClientExportField, number>();
  for (const field of options.fields) {
    const nonEmptyCount = entries.reduce<number>((count, entry) => {
      const value = entry.exportValues[field];
      const isNonEmpty = !(value === "" || value === null || typeof value === "undefined");
      return count + (isNonEmpty ? 1 : 0);
    }, 0);
    fieldStats.set(field, nonEmptyCount);
  }

  const finalFields = options.includeOnlyNonEmpty
    ? options.fields.filter((field) => (fieldStats.get(field) || 0) > 0)
    : options.fields;

  const rows = entries.map((entry) => (
    finalFields.reduce<Record<string, ExportValue>>((acc, field) => {
      acc[field] = entry.exportValues[field] ?? "";
      return acc;
    }, {})
  ));

  return {
    fy: options.fy,
    fields: finalFields,
    rows,
    previewColumns: finalFields.map((field) => {
      const config = getFieldConfig(field);
      return {
        id: field,
        label: config?.label || field,
        group: config?.group || "Other",
        fyScoped: Boolean(config?.fyScoped),
        nonEmptyCount: fieldStats.get(field) || 0,
      };
    }),
    summary: {
      matchedClients: entries.length,
      withContacts: entries.filter((entry) => entry.flags.hasContacts).length,
      withBilling: entries.filter((entry) => entry.flags.hasBilling).length,
      withPayments: entries.filter((entry) => entry.flags.hasPayments).length,
      withDocuments: entries.filter((entry) => entry.flags.hasDocuments).length,
      withEmails: entries.filter((entry) => entry.flags.hasEmails).length,
      withAnnualReturn: entries.filter((entry) => entry.flags.hasAnnualReturn).length,
    },
  };
}
