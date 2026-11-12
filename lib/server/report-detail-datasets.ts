import Client from "@/models/Client";
import Quotation from "@/models/Quotation";
import QuotationRevision from "@/models/QuotationRevision";
import Billing from "@/models/Billing";
import CreditTransaction from "@/models/CreditTransaction";
import Invoice from "@/models/Invoice";
import ClientTracker from "@/models/ClientTracker";
import ClientTrackerEntry from "@/models/ClientTrackerEntry";
import TrackerEmailCampaign from "@/models/TrackerEmailCampaign";
import Document from "@/models/Document";
import ClientWorkItem from "@/models/ClientWorkItem";
import UploadRecord from "@/models/UploadRecord";
import EmailLog from "@/models/EmailLog";
import { getFinancialYearMonths, invoiceMonthStatuses, type InvoiceCoverageInput } from "@/lib/invoiceCoverage";
import { type BillingAnalysisSource, type ReportDetailSource } from "@/lib/report-datasets";
import type { ReportStudioCellValue, ReportStudioConfig, ReportStudioResultRow } from "@/lib/report-studio";
import { executeBillingReport } from "./billing-report-service";
import { createSearchMatcher } from "@/lib/search/client-search";
import { sumQuantities } from "@/lib/financial-year-coverage";
import { money, paise } from "@/lib/billing-report";
import { loadFinanceEntries } from "./report-finance-datasets";

type ClientRow = { clientId: string; companyName: string; category?: string; state?: string };
type Row = Record<string, unknown>;
export type ReportDatasetRow = { id: string; clientId: string; values: Record<string, ReportStudioCellValue>; href?: string; billingDrilldown?: ReportStudioResultRow["billingDrilldown"] };
const MAX_ROWS = 25_000;
const LIMIT_MESSAGE = "This report exceeds the detail limit. Choose a narrower date range, financial year or dataset.";
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const string = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
const date = (value: unknown) => value instanceof Date || typeof value === "string" ? new Date(value).toJSON() : null;
function bounded<T>(rows: T[]) {
  if (rows.length > MAX_ROWS) throw new Error(LIMIT_MESSAGE);
  return rows;
}

// Keep the canonical in-memory predicate for parity and for legacy string dates.
// Only a required, directly stored date constraint can eliminate candidates here.
function withDateScope(scope: Row, field: string, config: ReportStudioConfig): Row {
  if (config.filters.logic !== "and") return scope;
  const bounds = config.filters.children.flatMap(child => {
    if (child.kind !== "condition" || child.field !== "record.date") return [];
    if (!["gte", "lte", "between"].includes(child.operator)) return [];
    const first = Date.parse(String(child.value ?? ""));
    const last = child.operator === "between" ? Date.parse(String(child.secondValue ?? "")) : first;
    if (!Number.isFinite(first) || !Number.isFinite(last)) return [];
    const end = child.operator === "between" ? child.secondValue : child.value;
    const range = {
      ...(child.operator !== "lte" && { $gte: new Date(first) }),
      ...(child.operator !== "gte" && (typeof end === "string" && end.length === 10 ? { $lt: new Date(last + 86_400_000) } : { $lte: new Date(last) })),
    };
    return [{ $or: [{ [field]: { $type: "string" } }, { [field]: range }] }];
  });
  return bounds.length ? { ...scope, $and: bounds } : scope;
}

function invoiceStatus(entry?: { status?: string | null }) {
  if (!entry || entry.status === "Pending") return "Missing";
  if (entry.status === "Received") return "Received";
  if (entry.status === "Partial / Issue") return "Partial";
  if (entry.status === "Nil / No Invoice") return "NIL";
  return "Unknown";
}

export async function loadReportDetail(source: Exclude<ReportDetailSource, BillingAnalysisSource | "target-breakdown">, config: ReportStudioConfig) {
  const financialYear = config.financialYear;
  const scope = { financialYear };
  const clients = source === "campaigns" ? [] : bounded(await Client.find({}).select("clientId companyName category state").limit(MAX_ROWS + 1).lean<ClientRow[]>());
  const people = new Map(clients.map(client => [client.clientId, client]));
  const clientName = (id: unknown, fallback?: unknown) => people.get(String(id))?.companyName || string(fallback) || string(id);
  const row = (raw: Row, values: ReportDatasetRow["values"], href?: string): ReportDatasetRow => {
    const clientId = string(raw.clientId) || "";
    const client = people.get(clientId);
    return { id: String(raw._id), clientId, href, values: {
      "client.clientId": clientId || null, "client.companyName": clientName(clientId, raw.clientName),
      "client.category": client?.category || null, "client.state": client?.state || null,
      "financialYear.year": string(raw.financialYear), "record.month": string(values["record.date"])?.slice(0, 7) ?? null,
      "record.day": string(values["record.date"])?.slice(0, 10) ?? null, ...values,
    } };
  };
  let rows: ReportDatasetRow[];
  switch (source) {
    case "quotation-register":
    case "quotation-charges":
    case "quotation-revisions": {
      const quotationScope = source !== "quotation-revisions" ? withDateScope(scope, "createdAt", config) : scope;
      const quotations = bounded(await Quotation.find(quotationScope).select("clientId clientName financialYear quotationNumber status currentRevisionNumber createdAt").limit(MAX_ROWS + 1).lean<Row[]>());
      const ids = quotations.map(quotation => String(quotation._id));
      const [revisions, bills] = await Promise.all([
        QuotationRevision.find(source === "quotation-revisions" ? withDateScope({ quotationId: { $in: ids } }, "createdAt", config) : { quotationId: { $in: ids } })
          .select("quotationId revisionNumber grandTotal createdAt isFinalised" + (source === "quotation-charges" ? " items additionalItems consultationCharges consultationGstPercent consultationGstAmount governmentFees" : ""))
          .limit(MAX_ROWS + 1).lean<Row[]>().then(bounded),
        source !== "quotation-revisions" ? Billing.find({ financialYear, sourceQuotationIds: { $in: ids } }).select("sourceQuotationIds").lean<Array<{ sourceQuotationIds: string[] }>>() : [],
      ]);
      if (source === "quotation-revisions") {
        const byId = new Map(quotations.map(quotation => [String(quotation._id), quotation]));
        rows = revisions.flatMap(revision => {
          const quotation = byId.get(String(revision.quotationId));
          return quotation ? [row({ ...quotation, _id: revision._id }, {
            "record.reference": string(quotation.quotationNumber), "record.revision": revision.revisionNumber == null ? null : String(revision.revisionNumber),
            "record.status": revision.revisionNumber === quotation.currentRevisionNumber ? "Current" : revision.isFinalised ? "Finalised" : "Prior",
            "record.date": date(revision.createdAt), "record.amount": number(revision.grandTotal),
          }, `/dashboard/quotations/${encodeURIComponent(String(quotation._id))}`)] : [];
        });
        break;
      }
      const current = new Map(revisions.map(revision => [`${revision.quotationId}:${revision.revisionNumber}`, revision]));
      const billed = new Set(bills.flatMap(bill => bill.sourceQuotationIds));
      if (source === "quotation-charges") {
        rows = bounded(quotations.flatMap(record => {
          const revision = current.get(`${record._id}:${record.currentRevisionNumber}`);
          if (!revision) return [];
          const items = (Array.isArray(revision.items) ? revision.items as Row[] : []).map(item => ({ ...item, chargeType: "EPR target" }));
          const extra = (Array.isArray(revision.additionalItems) ? revision.additionalItems as Row[] : []).map(item => ({ ...item, chargeType: "Other fee" }));
          const consultation = number(revision.consultationCharges);
          const consultationTax = number(revision.consultationGstAmount);
          const government = number(revision.governmentFees);
          const charges: Row[] = [...items, ...extra,
            ...(consultation ? [{ chargeType: "Consultancy", description: "Consultancy", subtotal: consultation, gstPercent: revision.consultationGstPercent, gstAmount: consultationTax,
              totalAmount: consultationTax == null ? null : money(paise(consultation) + paise(consultationTax)) }] : []),
            ...(government ? [{ chargeType: "Government", description: "Government fees", subtotal: government, gstAmount: 0, gstPercent: 0, totalAmount: government }] : [])];
          return charges.map((item, index) => row({ ...record, _id: `${record._id}:${index}` }, {
            "record.reference": string(record.quotationNumber), "record.date": date(record.createdAt), "record.status": string(record.status),
            "record.billingState": billed.has(String(record._id)) ? "Linked" : record.status === "Accepted" ? "Awaiting billing" : "Not Applicable",
            "record.chargeType": string(item.chargeType), "record.description": string(item.description), "record.quantity": number(item.quantity),
            "record.rate": number(item.rate), "record.taxable": number(item.subtotal), "record.gstRate": number(item.gstPercent),
            "record.gst": number(item.gstAmount), "record.amount": number(item.totalAmount),
          }, `/dashboard/quotations/${encodeURIComponent(String(record._id))}`));
        }));
        break;
      }
      rows = quotations.map(record => row(record, { "record.reference": string(record.quotationNumber), "record.status": string(record.status), "record.date": date(record.createdAt),
        "record.revision": record.currentRevisionNumber == null ? null : String(record.currentRevisionNumber), "record.amount": number(current.get(`${record._id}:${record.currentRevisionNumber}`)?.grandTotal),
        "record.billingState": billed.has(String(record._id)) ? "Linked" : record.status === "Accepted" ? "Awaiting billing" : "Not Applicable",
      }, `/dashboard/quotations/${encodeURIComponent(String(record._id))}`));
      break;
    }
    case "bill-register": {
      const result = await executeBillingReport({ financialYear, view: "bill", dateBasis: "billDate" }, true);
      rows = bounded(result.bills).map(bill => row({ _id: bill.billingId, clientId: bill.clientId, clientName: bill.companyName, financialYear }, {
        "record.reference": bill.invoiceNumber || bill.title, "record.status": bill.paymentStatus, "record.date": bill.billDate || null,
        "record.amount": bill.billed, "record.paid": bill.paid, "record.outstanding": bill.outstanding,
      }, `/dashboard/billing?fy=${encodeURIComponent(financialYear)}&clientId=${encodeURIComponent(bill.clientId)}`));
      return { rows: filterSearch(rows, config.search), messages: result.summary.unresolvedPaymentCount ? [`${result.summary.unresolvedPaymentCount} payments require allocation review.`] : [] };
    }
    case "payment-register":
    case "advance-register":
    case "finance-activity": {
      const { entries, messages } = await loadFinanceEntries(source, [...new Set([financialYear, ...(config.comparisonYears ?? [])])], config.paymentPeriod);
      rows = entries.map(({ record, values }) => row(record, values,
        record.clientId ? `/dashboard/billing?fy=${encodeURIComponent(String(values["finance.billFY"] ?? record.financialYear ?? financialYear))}&clientId=${encodeURIComponent(String(record.clientId))}` : undefined));
      return { rows: filterSearch(rows, config.search), messages };
    }
    case "credit-ledger":
    case "credit-perspectives": {
      const credits = bounded(await CreditTransaction.find(withDateScope(scope, "date", config)).select("financialYear fromClientId toClientId creditType date cat1 cat2 cat3 cat4 cat1Qty cat2Qty cat3Qty cat4Qty rateCat1 rateCat2 rateCat3 rateCat4 totalAmount quantity").limit(MAX_ROWS + 1).lean<Row[]>());
      if (source === "credit-perspectives") {
        rows = bounded(credits.flatMap(record => {
          const parts = [1, 2, 3, 4].flatMap(id => {
            const quantity = number(record[`cat${id}Qty`] ?? record[`cat${id}`]);
            const rate = number(record[`rateCat${id}`]);
            return quantity == null || quantity === 0 ? [] : [{ category: `CAT-${["I", "II", "III", "IV"][id - 1]}`, quantity, rate, value: rate == null ? null : money(paise(rate * quantity)) }];
          });
          const gross = number(record.totalAmount);
          const reconciled = gross != null && parts.every(part => part.value != null) && parts.reduce((sum, part) => sum + paise(part.value), 0) === paise(gross);
          const categories = parts.length ? parts.map(part => ({ ...part, value: reconciled ? part.value : null }))
            : [{ category: "Unspecified", quantity: number(record.quantity), rate: null, value: gross }];
          return (["Purchase", "Sale"] as const).flatMap(direction => {
            const purchase = direction === "Purchase";
            const clientId = string(purchase ? record.toClientId : record.fromClientId);
            if (!clientId) return [];
            return categories.map((part, index) => row({ ...record, clientId, _id: `${record._id}:${direction}:${index}` }, {
              "record.direction": direction, "record.category": part.category, "record.status": string(record.creditType), "record.date": date(record.date),
              "record.seller": clientName(record.fromClientId), "record.buyer": clientName(record.toClientId), "record.rate": part.rate,
              "credit.purchaseQuantity": purchase ? part.quantity : 0, "credit.saleQuantity": purchase ? 0 : part.quantity,
              "credit.purchaseValue": purchase ? part.value : 0, "credit.saleValue": purchase ? 0 : part.value,
            }, "/dashboard/credit-transactions"));
          });
        }));
        return { rows: filterSearch(rows, config.search), messages: ["Purchase and sale measures represent the two client perspectives. Category values require reconciliation to the recorded transaction total."] };
      }
      rows = credits.map(record => {
        const quantities = [1, 2, 3, 4].map(id => number(record[`cat${id}Qty`] ?? record[`cat${id}`] ?? 0));
        const rates = [1, 2, 3, 4].flatMap(id => { const rate = number(record[`rateCat${id}`]); return rate != null && (quantities[id - 1] || 0) > 0 ? [rate] : []; });
        return row(record, { "record.seller": clientName(record.fromClientId), "record.buyer": clientName(record.toClientId), "record.status": string(record.creditType),
          "record.date": date(record.date), "record.quantity": quantities.every(value => value != null && value >= 0) ? sumQuantities(quantities as number[]) : null,
          "record.amount": number(record.totalAmount), "record.rates": rates.length ? rates : null }, "/dashboard/credit-transactions");
      });
      break;
    }
    case "invoice-months":
    case "invoice-coverage": {
      const matchingClients = config.search ? clients.filter(client => createSearchMatcher(config.search)([client.companyName, client.clientId, client.category, client.state].join(" "))) : clients;
      if (matchingClients.length * (source === "invoice-months" ? 24 : 2) > MAX_ROWS) throw new Error("This report exceeds the invoice month limit. Search for a client or client category first.");
      const invoices = bounded(await Invoice.find({ financialYear, clientId: { $in: matchingClients.map(client => client.clientId) } })
        .select("clientId invoiceType status fromDate toDate updatedAt createdAt").limit(MAX_ROWS + 1).lean<Array<InvoiceCoverageInput & { clientId: string }>>());
      const grouped = new Map<string, InvoiceCoverageInput[]>();
      for (const invoice of invoices) {
        const records = grouped.get(invoice.clientId) || [];
        records.push(invoice); grouped.set(invoice.clientId, records);
      }
      const months = getFinancialYearMonths(financialYear);
      rows = matchingClients.flatMap(client => {
        const statuses = invoiceMonthStatuses(grouped.get(client.clientId) || [], financialYear);
        return (["sale", "purchase"] as const).flatMap(direction => {
          const directionLabel = direction === "sale" ? "Sale" : "Purchase";
          const values = months.map(month => invoiceStatus(statuses[direction].get(month.key)));
          const href = `/dashboard/cpcb-uploads/invoice-tracking?fy=${encodeURIComponent(financialYear)}`;
          if (source === "invoice-months") return months.map((month, index) => row({ _id: `${client.clientId}:${direction}:${month.key}`, clientId: client.clientId, financialYear }, {
            "record.direction": directionLabel, "record.date": `${month.key}-01`, "invoice.status": values[index],
            "record.status": statuses[direction].has(month.key) ? statuses[direction].get(month.key)?.status || "Received (legacy)" : "Missing",
            "invoice.received": Number(values[index] === "Received"), "invoice.covered": Number(["Received", "NIL"].includes(values[index])),
            "invoice.missing": Number(values[index] === "Missing"), "invoice.partial": Number(values[index] === "Partial"),
            "invoice.nil": Number(values[index] === "NIL"), "invoice.unknown": Number(values[index] === "Unknown"),
          }, href));
          const count = (status: string) => values.filter(value => value === status).length;
          const received = count("Received"), nil = count("NIL"), unknown = count("Unknown"), partial = count("Partial");
          const completion = (total: number) => total === 12 ? "Yes" : unknown && total + unknown === 12 ? "Unknown" : total || partial ? "Partial" : "No";
          return [row({ _id: `${client.clientId}:${direction}:${financialYear}`, clientId: client.clientId, financialYear }, {
            "record.direction": directionLabel,
            "invoice.received": received, "invoice.covered": received + nil, "invoice.missing": count("Missing"),
            "invoice.partial": partial, "invoice.nil": nil, "invoice.unknown": unknown,
            "invoice.complete": completion(received), "invoice.coverageComplete": completion(received + nil),
            ...Object.fromEntries(values.map((status, index) => [`invoice.month.${index + 1}`, status])),
          }, href)];
        });
      });
      break;
    }
    case "tracker-entries": {
      const trackers = await ClientTracker.find(scope).select("name status").lean<Row[]>();
      const labels = new Map(trackers.map(tracker => [String(tracker._id), tracker]));
      const entries = bounded(await ClientTrackerEntry.find(withDateScope({ trackerId: { $in: trackers.map(tracker => tracker._id) }, inScope: { $ne: false } }, "updatedAt", config))
        .select("trackerId clientId updatedAt").limit(MAX_ROWS + 1).lean<Row[]>());
      rows = entries.map(record => row({ ...record, financialYear }, { "record.reference": string(labels.get(String(record.trackerId))?.name),
        "record.status": string(labels.get(String(record.trackerId))?.status), "record.date": date(record.updatedAt) }, `/dashboard/client-trackers/${encodeURIComponent(String(record.trackerId))}`));
      break;
    }
    case "upload-register": {
      const uploads = bounded(await UploadRecord.find(withDateScope(scope, "createdAt", config)).select("clientId financialYear uploadType createdAt cat1 cat2 cat3 cat4 invoiceCount").limit(MAX_ROWS + 1).lean<Row[]>());
      rows = uploads.map(record => {
        const quantities = [record.cat1, record.cat2, record.cat3, record.cat4].map(number);
        return row(record, { "record.direction": record.uploadType === "purchase" ? "Purchase" : record.uploadType === "sale" ? "Sale" : null,
          "record.date": date(record.createdAt), "record.quantity": quantities.every(value => value != null && value >= 0) ? sumQuantities(quantities as number[]) : null,
          "record.invoiceCount": number(record.invoiceCount) }, "/dashboard/cpcb-uploads/upload-records");
      });
      return { rows: filterSearch(rows, config.search), messages: ["These quantities describe recorded uploads. They do not verify a client's target or filing completion."] };
    }
    case "campaigns": {
      const campaigns = bounded(await TrackerEmailCampaign.aggregate<Row>([
        { $match: withDateScope({ "snapshot.financialYear": financialYear }, "createdAt", config) }, { $limit: MAX_ROWS + 1 },
        { $project: { trackerId: 1, workflowName: 1, status: 1, mode: 1, total: 1, createdAt: 1, failed: 1,
          sent: { $size: { $filter: { input: { $ifNull: ["$items", []] }, as: "item", cond: { $or: [{ $eq: ["$$item.status", "sent"] }, { $eq: ["$$item.draftResolution", "sent"] }] } } } },
          drafts: { $size: { $filter: { input: { $ifNull: ["$items", []] }, as: "item", cond: { $and: [{ $eq: ["$$item.status", "draft"] }, { $not: [{ $in: ["$$item.draftResolution", ["sent", "discarded"]] }] }] } } } },
        } },
      ]));
      rows = campaigns.map(record => row({ ...record, financialYear }, { "record.reference": string(record.workflowName), "record.status": string(record.status), "record.mode": string(record.mode),
        "record.date": date(record.createdAt), "record.quantity": number(record.total), "record.sent": number(record.sent), "record.drafts": number(record.drafts), "record.failed": number(record.failed),
      }, `/dashboard/client-trackers/${encodeURIComponent(String(record.trackerId))}`));
      break;
    }
    case "document-register": {
      const documents = bounded(await Document.find(withDateScope({ $or: [scope, { financialYear: "" }, { financialYear: null }] }, "uploadedDate", config))
        .select("clientId financialYear documentName category documentKind uploadedDate").limit(MAX_ROWS + 1).lean<Row[]>());
      rows = documents.map(record => row(record, { "record.reference": string(record.documentName), "record.status": string(record.category), "record.mode": string(record.documentKind), "record.date": date(record.uploadedDate) }));
      break;
    }
    case "email-activity": {
      const logs = bounded(await EmailLog.find(withDateScope({ $or: [scope, { financialYear: "" }, { financialYear: null }] }, "sentAt", config))
        .select("clientId clientName financialYear type status communicationStatus sentAt").limit(MAX_ROWS + 1).lean<Row[]>());
      rows = logs.map(record => row(record, { "record.mode": string(record.type), "record.status": string(record.communicationStatus) || string(record.status),
        "record.date": date(record.sentAt) }, "/dashboard/email-history"));
      break;
    }
    case "work-items": {
      const tasks = bounded(await ClientWorkItem.find(withDateScope({ $or: [scope, { financialYear: "" }, { financialYear: null }] }, "dueAt", config))
        .select("clientId financialYear title status kind dueAt").limit(MAX_ROWS + 1).lean<Row[]>());
      rows = tasks.map(record => row(record, { "record.reference": string(record.title), "record.status": string(record.status), "record.mode": string(record.kind), "record.date": date(record.dueAt) }));
      break;
    }
  }
  return { rows: filterSearch(rows, config.search), messages: [] };
}

function filterSearch(rows: ReportDatasetRow[], search: string) {
  if (!search) return rows;
  const matches = createSearchMatcher(search);
  return rows.filter(row => matches(Object.values(row.values).filter(value => typeof value === "string").join(" ")));
}
