import Invoice from "@/models/Invoice";
import AnnualReturn from "@/models/AnnualReturn";
import UploadRecord from "@/models/UploadRecord";
import type { TrackerField, TrackerValue, TrackerValues } from "@/lib/clientTrackers";
import { buildInvoiceCoverageSummary, type InvoiceCoverageInput } from "@/lib/invoiceCoverage";

function dateText(value: Date | string | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export async function resolveTrackerLinkedValues(fields: TrackerField[], clientIds: string[], financialYear?: string) {
  const linked = fields.filter((field) => field.dataLink);
  const values = new Map<string, TrackerValues>();
  if (!linked.length || !clientIds.length) return values;
  const usesInvoices = linked.some((field) => field.dataLink?.source === "purchaseInvoices" || field.dataLink?.source === "saleInvoices");
  const usesAnnualReturns = linked.some((field) => field.dataLink?.source === "annualReturn");
  const usesUploads = linked.some((field) => ["purchaseUploads", "saleUploads", "uploadedData"].includes(field.dataLink?.source || ""));
  const scope = financialYear ? { financialYear } : {};
  const [invoices, returns, uploads] = await Promise.all([
    usesInvoices ? Invoice.find({ clientId: { $in: clientIds }, ...(financialYear ? { financialYear } : {}) }).select("clientId invoiceType status fromDate toDate createdAt updatedAt").lean() : Promise.resolve([]),
    usesAnnualReturns ? AnnualReturn.find({ clientId: { $in: clientIds }, ...scope }).sort({ financialYear: -1, updatedAt: -1 }).select("clientId status filingDate").lean() : Promise.resolve([]),
    usesUploads ? UploadRecord.find({ clientId: { $in: clientIds }, ...scope }).select("clientId uploadType cat1 cat2 cat3 cat4 invoiceCount").lean() : Promise.resolve([]),
  ]);
  const invoicesByClient = new Map<string, typeof invoices>();
  invoices.forEach((invoice) => {
    const records = invoicesByClient.get(invoice.clientId) || [];
    records.push(invoice);
    invoicesByClient.set(invoice.clientId, records);
  });
  const returnsByClient = new Map<string, typeof returns[number]>();
  returns.forEach((record) => {
    if (!returnsByClient.has(record.clientId)) returnsByClient.set(record.clientId, record);
  });
  const uploadsByClient = new Map<string, typeof uploads>();
  uploads.forEach((upload) => {
    const records = uploadsByClient.get(upload.clientId) || [];
    records.push(upload);
    uploadsByClient.set(upload.clientId, records);
  });
  clientIds.forEach((clientId) => {
    const result: TrackerValues = {};
    // Reuse calculations within this fresh request only, never across server reads.
    const invoiceSummaries = new Map<string, {
      records: typeof invoices; latest: typeof invoices[number] | undefined;
      hasCompletedCoverage: boolean;
      coverage: ReturnType<typeof buildInvoiceCoverageSummary>["purchase"] | null;
    }>();
    const uploadSummaries = new Map<string, {
      records: typeof uploads; quantity: number; invoiceCount: number;
      categories: Record<"cat1" | "cat2" | "cat3" | "cat4", number>;
    }>();
    linked.forEach((field) => {
      const link = field.dataLink!;
      if (link.source === "annualReturn") {
        const record = returnsByClient.get(clientId);
        const status = record?.status || "Pending";
        const value: TrackerValue = link.display === "yesNo" ? ["Filed", "Verified"].includes(status) : link.display === "latestDate" ? dateText(record?.filingDate) : status;
        result[field.key] = value;
        return;
      }
      if (["purchaseUploads", "saleUploads", "uploadedData"].includes(link.source)) {
        let summary = uploadSummaries.get(link.source);
        if (!summary) {
          const records = (uploadsByClient.get(clientId) || []).filter((record) => link.source === "uploadedData" || record.uploadType === (link.source === "purchaseUploads" ? "purchase" : "sale"));
          const quantity = records.reduce((total, record) => total + (Number(record.cat1) || 0) + (Number(record.cat2) || 0) + (Number(record.cat3) || 0) + (Number(record.cat4) || 0), 0);
          const invoiceCount = records.reduce((total, record) => total + (Number(record.invoiceCount) || 0), 0);
          summary = { records, quantity, invoiceCount, categories: {
            cat1: records.reduce((total, record) => total + (Number(record.cat1) || 0), 0),
            cat2: records.reduce((total, record) => total + (Number(record.cat2) || 0), 0),
            cat3: records.reduce((total, record) => total + (Number(record.cat3) || 0), 0),
            cat4: records.reduce((total, record) => total + (Number(record.cat4) || 0), 0),
          } };
          uploadSummaries.set(link.source, summary);
        }
        const { records, quantity, invoiceCount, categories } = summary;
        const categoryQuantity = ["cat1", "cat2", "cat3", "cat4"].includes(link.display)
          ? categories[link.display as keyof typeof categories]
          : null;
        result[field.key] = link.display === "yesNo" ? records.length > 0 : link.display === "uploadStatus" ? (records.length ? "Partial" : "Not Started") : link.display === "quantity" ? quantity : link.display === "invoiceCount" ? invoiceCount : categoryQuantity ?? records.length;
        return;
      }
      const type = link.source === "purchaseInvoices" ? "purchase" : "sale";
      let summary = invoiceSummaries.get(type);
      if (!summary) {
        const records = (invoicesByClient.get(clientId) || []).filter((invoice) => invoice.invoiceType === type);
        const latest = [...records].sort((a, b) => new Date(b.toDate).getTime() - new Date(a.toDate).getTime())[0];
        const hasCompletedCoverage = records.some((invoice) => invoice.status === "Received" || invoice.status === "Nil / No Invoice");
        const coverage = financialYear ? buildInvoiceCoverageSummary(records as unknown as InvoiceCoverageInput[], financialYear)[type] : null;
        summary = { records, latest, hasCompletedCoverage, coverage };
        invoiceSummaries.set(type, summary);
      }
      const { records, latest, hasCompletedCoverage, coverage } = summary;
      const coverageStatus = !coverage ? "Unknown" : coverage.doneCount === 0 ? "Not Started" : coverage.leftCount === 0 ? "Complete" : "Partial";
      result[field.key] = link.display === "coverageStatus" ? coverageStatus : link.display === "monthsCovered" ? coverage?.doneText || "-" : link.display === "requiredMonths" ? (coverage ? coverage.doneCount + coverage.leftCount : 0) : link.display === "missingMonths" ? coverage?.leftText || "-" : link.display === "yesNo" ? hasCompletedCoverage : link.display === "count" ? records.length : link.display === "latestDate" ? dateText(latest?.toDate) : latest?.status || "Pending";
    });
    values.set(clientId, result);
  });
  return values;
}
