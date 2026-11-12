import AnnualReturn from "@/models/AnnualReturn";
import Billing from "@/models/Billing";
import Client from "@/models/Client";
import Invoice from "@/models/Invoice";
import Quotation from "@/models/Quotation";
import UploadRecord from "@/models/UploadRecord";
import {
  buildInvoiceCoverageSummary,
  type InvoiceCoverageInput,
} from "@/lib/invoiceCoverage";
import {
  annualReturnPrerequisitesComplete,
  deriveAutomaticAnnualReturnStatus,
  type AnnualReturnStatus,
} from "@/lib/annualReturnStatus";

export type AnnualReturnSyncResult = {
  status: AnnualReturnStatus | null;
  changed: boolean;
};

/**
 * Recomputes the non-terminal Annual Return state from the persisted workflow.
 * The caller must connect to MongoDB before invoking this function.
 */
export async function syncAnnualReturnStatus(
  clientIdValue: string,
  financialYearValue: string,
): Promise<AnnualReturnSyncResult> {
  const clientId = String(clientIdValue || "").trim();
  const financialYear = String(financialYearValue || "").trim();
  if (!clientId || !financialYear) return { status: null, changed: false };
  const key = { clientId, financialYear };
  const findStatus = () => AnnualReturn.findOne(key).select("status").lean<{
    _id: unknown;
    status?: AnnualReturnStatus;
  } | null>();

  const [current, client, invoices, hasUpload, hasBilling, quotations] = await Promise.all([
    findStatus(),
    Client.findOne({ clientId }).select("category").lean(),
    Invoice.find({ clientId, financialYear })
      .select("invoiceType status fromDate toDate createdAt updatedAt")
      .lean(),
    UploadRecord.exists({ clientId, financialYear }),
    Billing.exists({ clientId, financialYear, billType: { $in: ["annual_return", null] } }),
    Quotation.find({ clientId, financialYear }).select("status").lean(),
  ]);

  const typedInvoices = invoices as unknown as InvoiceCoverageInput[];
  const typedClient = client as unknown as { category?: string } | null;
  const typedQuotations = quotations as unknown as Array<{ status?: string }>;
  const coverage = buildInvoiceCoverageSummary(typedInvoices, financialYear);
  const hasAcceptedQuotation = typedQuotations.some((quotation) => quotation.status === "Accepted");
  const hasWorkflowActivity =
    invoices.length > 0 || Boolean(hasUpload) || Boolean(hasBilling) || quotations.length > 0;
  const allPrerequisitesComplete = annualReturnPrerequisitesComplete({
    clientCategory: typedClient?.category,
    invoiceCoveragePercent: ((coverage.sale.doneCount + coverage.purchase.doneCount) / 24) * 100,
    hasUpload: Boolean(hasUpload),
    hasBilling: Boolean(hasBilling),
    hasAcceptedQuotation,
  });

  // A legacy record without a status previously received the Mongoose default.
  const currentStatus = current && (current.status === undefined ? "Pending" : current.status);
  const nextStatus = deriveAutomaticAnnualReturnStatus({
    currentStatus,
    hasWorkflowActivity,
    allPrerequisitesComplete,
  });

  if (!nextStatus || nextStatus === currentStatus) {
    return { status: nextStatus, changed: false };
  }

  // Automatic reconciliation must not overwrite a filing decision made after this read.
  if (current) {
    const updated = await AnnualReturn.findOneAndUpdate(
      { _id: current._id, status: current.status === undefined ? { $exists: false } : { $eq: current.status, $exists: true } },
      { $set: { status: nextStatus } },
      { new: true, runValidators: true },
    );
    if (updated) return { status: nextStatus, changed: true };
  } else {
    try {
      await AnnualReturn.create({ ...key, status: nextStatus });
      return { status: nextStatus, changed: true };
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== 11000) throw error;
      const inserted = await findStatus();
      if (!inserted) throw error;
      return { status: inserted.status ?? "Pending", changed: false };
    }
  }

  const latest = await findStatus();
  return { status: latest ? latest.status ?? "Pending" : null, changed: false };
}
