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

  const [current, client, invoices, hasUpload, hasBilling, quotations] = await Promise.all([
    AnnualReturn.findOne({ clientId, financialYear }).select("status"),
    Client.findOne({ clientId }).select("category").lean(),
    Invoice.find({ clientId, financialYear })
      .select("invoiceType status fromDate toDate createdAt updatedAt")
      .lean(),
    UploadRecord.exists({ clientId, financialYear }),
    Billing.exists({ clientId, financialYear }),
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

  const currentStatus = current?.status as AnnualReturnStatus | undefined;
  const nextStatus = deriveAutomaticAnnualReturnStatus({
    currentStatus,
    hasWorkflowActivity,
    allPrerequisitesComplete,
  });

  if (!nextStatus || nextStatus === currentStatus) {
    return { status: nextStatus, changed: false };
  }

  await AnnualReturn.findOneAndUpdate(
    { clientId, financialYear },
    { $set: { status: nextStatus } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  return { status: nextStatus, changed: true };
}
