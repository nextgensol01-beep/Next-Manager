import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Client from "@/models/Client";
import CreditTransaction from "@/models/CreditTransaction";
import FinancialYear from "@/models/FinancialYear";
import Billing from "@/models/Billing";
import Payment from "@/models/Payment";
import EmailLog from "@/models/EmailLog";
import DeletedRecord from "@/models/DeletedRecord";
import AnnualReturn from "@/models/AnnualReturn";
import Invoice from "@/models/Invoice";
import UploadRecord from "@/models/UploadRecord";
import Quotation from "@/models/Quotation";
import DocumentRecord from "@/models/Document";
import ActivityEvent from "@/models/ActivityEvent";

type ActivityRecord = {
  id: string;
  category: "compliance" | "financial" | "communications" | "documents" | "system";
  type: string;
  label: string;
  detail: string;
  date: string;
  color: string;
  financialYear?: string;
  badge?: string;
  badgeColor?: string;
  entityId?: string;
  entityType?: "billing" | "payment" | "financial-year" | "annual-return" | "invoice" | "upload" | "quotation" | "document" | "email" | "trash";
  recordType?: string;
  actionSearch?: string;
};

type ActivityRange = "7d" | "30d" | "year";

const ACTIVITY_CATEGORIES = new Set<ActivityRecord["category"]>([
  "compliance",
  "financial",
  "communications",
  "documents",
  "system",
]);

const emailTypeLabel: Record<string, string> = {
  quotation: "Quotation",
  payment_reminder: "Reminder",
  annual_return_draft: "AR Draft",
  custom: "Email",
};

const emailTypeBadgeColor: Record<string, string> = {
  quotation: "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300",
  payment_reminder: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  annual_return_draft: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  custom: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

const recycleBinLabels: Record<string, string> = {
  billing: "Billing moved to recycle bin",
  payment: "Payment moved to recycle bin",
  financialYear: "Financial year moved to recycle bin",
  creditTransaction: "Credit transaction moved to recycle bin",
  annualReturn: "Annual return moved to recycle bin",
  uploadRecord: "Upload record moved to recycle bin",
  invoice: "Invoice moved to recycle bin",
  document: "Document moved to recycle bin",
  client: "Client moved to recycle bin",
};

const readDate = (value: unknown) => {
  if (!value) return "";
  return value instanceof Date ? value.toISOString() : String(value);
};

const formatAmount = (value: unknown) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

const sumCreditCategories = (record: Record<string, unknown>) => (
  Number(record.cat1 || 0) +
  Number(record.cat2 || 0) +
  Number(record.cat3 || 0) +
  Number(record.cat4 || 0)
) || Number(record.quantity || 0);

const extractFinancialYear = (value: unknown) => (
  typeof value === "string" && value.trim() ? value.trim() : undefined
);

const parsePositiveInt = (value: string | null, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
};

const parseRange = (value: string | null): ActivityRange => {
  if (value === "7d" || value === "year") return value;
  return "30d";
};

const applyDateRange = (items: ActivityRecord[], range: ActivityRange) => {
  if (range === "year") return items;

  const cutoff = Date.now() - ((range === "7d" ? 7 : 30) * 24 * 60 * 60 * 1000);
  return items.filter((activity) => {
    const activityTime = new Date(activity.date).getTime();
    return Number.isFinite(activityTime) && activityTime >= cutoff;
  });
};

const applyActivityFilters = (
  items: ActivityRecord[],
  {
    category,
    financialYear,
    range,
  }: {
    category?: ActivityRecord["category"];
    financialYear?: string;
    range: ActivityRange;
  }
) => {
  let nextItems = items.filter((activity) => activity.date);

  if (category) {
    nextItems = nextItems.filter((activity) => activity.category === category);
  }

  if (financialYear) {
    nextItems = nextItems.filter((activity) => (
      !activity.financialYear || activity.financialYear === financialYear
    ));
  }

  return applyDateRange(nextItems, range);
};

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");
    if (!clientId) {
      return NextResponse.json({
        items: [],
        total: 0,
        hasMore: false,
        nextOffset: 0,
        latestEmailActivity: null,
      });
    }

    const limit = Math.min(parsePositiveInt(searchParams.get("limit"), 10) || 10, 50);
    const offset = parsePositiveInt(searchParams.get("offset"), 0);
    const range = parseRange(searchParams.get("range"));
    const financialYear = searchParams.get("financialYear")?.trim() || undefined;
    const rawCategory = searchParams.get("category");
    const category = rawCategory && ACTIVITY_CATEGORIES.has(rawCategory as ActivityRecord["category"])
      ? rawCategory as ActivityRecord["category"]
      : undefined;

    const client = await Client.findOne({ clientId })
      .select("companyName")
      .lean() as { companyName?: string } | null;
    const clientName = typeof client?.companyName === "string" ? client.companyName.trim() : "";

    const [transactions, fyRecords, annualReturns, invoices, uploads, quotations, documents, billings, payments, emailLogs, deletedRecords, persistedEvents] = await Promise.all([
      CreditTransaction.find({
        $or: [{ fromClientId: clientId }, { toClientId: clientId }],
      }).lean(),
      FinancialYear.find({ clientId }).lean(),
      AnnualReturn.find({ clientId }).lean(),
      Invoice.find({ clientId }).lean(),
      UploadRecord.find({ clientId }).lean(),
      Quotation.find({ clientId }).lean(),
      DocumentRecord.find({ clientId }).lean(),
      Billing.find({ clientId }).lean(),
      Payment.find({ clientId }).lean(),
      EmailLog.find(clientName
        ? {
            $or: [
              { clientId },
              { clientName },
            ],
          }
        : { clientId }
      ).lean(),
      DeletedRecord.find({
        $or: [
          {
            recordType: {
              $in: ["financialYear", "billing", "payment", "annualReturn", "uploadRecord", "invoice", "document"],
            },
            "data.clientId": clientId,
          },
          { recordType: "creditTransaction", "data.fromClientId": clientId },
          { recordType: "creditTransaction", "data.toClientId": clientId },
        ],
      }).lean(),
      ActivityEvent.find({ clientId }).sort({ occurredAt: -1 }).lean(),
    ]);

    const activities: ActivityRecord[] = [];
    const persistedRelatedIds = new Set(
      persistedEvents.flatMap((event) => (
        Array.isArray(event.relatedEntityIds) ? event.relatedEntityIds.map(String) : []
      ))
    );
    const persistedDocumentOriginIds = new Set(
      persistedEvents
        .filter((event) => ["document_uploaded", "document_linked", "document_migrated", "document_restored"].includes(event.type))
        .flatMap((event) => (
          Array.isArray(event.relatedEntityIds) ? event.relatedEntityIds.map(String) : []
        ))
    );

    persistedEvents.forEach((event) => {
      activities.push({
        id: `event-${String(event._id)}`,
        category: event.category,
        type: event.type,
        label: event.label,
        detail: event.detail,
        date: readDate(event.occurredAt),
        color: event.color || "blue",
        financialYear: event.financialYear || undefined,
        badge: event.badge || undefined,
        badgeColor: event.badgeColor || undefined,
        entityId: event.entityId || undefined,
        entityType: event.entityType as ActivityRecord["entityType"] | undefined,
        recordType: event.recordType || undefined,
        actionSearch: event.actionSearch || undefined,
      });
    });

    transactions.forEach((tx) => {
      const txRecord = tx as unknown as Record<string, unknown>;
      const qty = sumCreditCategories(txRecord);
      const financialYear = extractFinancialYear(txRecord.financialYear);
      const isSeller = txRecord.fromClientId === clientId;
      const isBuyer = txRecord.toClientId === clientId;

      if (isSeller) {
        activities.push({
          id: `credit-sold-${String(txRecord._id || Math.random())}`,
          category: "compliance",
          type: "credit_sold",
          label: "Credits Sold",
          detail: `${qty.toLocaleString("en-IN")} units${financialYear ? ` - FY ${financialYear}` : ""}`,
          date: readDate(txRecord.date || txRecord.createdAt),
          color: "teal",
          financialYear,
          badge: financialYear,
          badgeColor: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
        });
      }

      if (isBuyer) {
        activities.push({
          id: `target-achieved-${String(txRecord._id || Math.random())}`,
          category: "compliance",
          type: "target_achieved",
          label: "Target Achieved",
          detail: `${qty.toLocaleString("en-IN")} units${financialYear ? ` - FY ${financialYear}` : ""}`,
          date: readDate(txRecord.date || txRecord.createdAt),
          color: "blue",
          financialYear,
          badge: financialYear,
          badgeColor: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
        });
      }
    });

    fyRecords.forEach((fy) => {
      const fyRecord = fy as unknown as Record<string, unknown>;
      const financialYear = extractFinancialYear(fyRecord.financialYear);
      const totalTarget = (
        Number(fyRecord.targetCat1 || 0) +
        Number(fyRecord.targetCat2 || 0) +
        Number(fyRecord.targetCat3 || 0) +
        Number(fyRecord.targetCat4 || 0)
      ) || Number(fyRecord.targetAmount || 0);
      const totalCredits = (
        Number(fyRecord.creditsCat1 || 0) +
        Number(fyRecord.creditsCat2 || 0) +
        Number(fyRecord.creditsCat3 || 0) +
        Number(fyRecord.creditsCat4 || 0)
      ) || Number(fyRecord.availableCredits || 0);

      if (totalTarget > 0) {
        activities.push({
          id: `fy-target-${String(fyRecord._id || financialYear || Math.random())}`,
          category: "compliance",
          type: "target_set",
          label: "Target Set",
          detail: `${totalTarget.toLocaleString("en-IN")} units${financialYear ? ` - FY ${financialYear}` : ""}`,
          date: readDate(fyRecord.createdAt || fyRecord.updatedAt),
          color: "amber",
          financialYear,
          badge: financialYear,
          badgeColor: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
          entityId: String(fyRecord._id || ""),
          entityType: "financial-year",
        });
      }

      if (totalCredits > 0) {
        activities.push({
          id: `fy-credits-${String(fyRecord._id || financialYear || Math.random())}`,
          category: "compliance",
          type: "credits_set",
          label: "Credits Allocated",
          detail: `${totalCredits.toLocaleString("en-IN")} units${financialYear ? ` - FY ${financialYear}` : ""}`,
          date: readDate(fyRecord.createdAt || fyRecord.updatedAt),
          color: "brand",
          financialYear,
          badge: financialYear,
          badgeColor: "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300",
          entityId: String(fyRecord._id || ""),
          entityType: "financial-year",
        });
      }
    });

    annualReturns.forEach((record) => {
      const item = record as unknown as Record<string, unknown>;
      const financialYear = extractFinancialYear(item.financialYear);
      const status = typeof item.status === "string" ? item.status : "Not Started";
      activities.push({
        id: `annual-return-${String(item._id || financialYear || Math.random())}`,
        category: "compliance",
        type: "annual_return_updated",
        label: "Annual Return Updated",
        detail: `Status changed to ${status}${item.acknowledgeNumber ? ` · Acknowledgement: ${String(item.acknowledgeNumber)}` : ""}`,
        date: readDate(item.updatedAt || item.createdAt),
        color: status === "Filed" || status === "Verified" ? "emerald" : "amber",
        financialYear,
        badge: status,
        badgeColor: status === "Filed" || status === "Verified"
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
        entityId: String(item._id || ""),
        entityType: "annual-return",
      });
    });

    invoices.forEach((record) => {
      const item = record as unknown as Record<string, unknown>;
      const financialYear = extractFinancialYear(item.financialYear);
      const invoiceType = item.invoiceType === "purchase" ? "Purchase" : "Sale";
      const status = typeof item.status === "string" ? item.status : "Received";
      activities.push({
        id: `invoice-${String(item._id || Math.random())}`,
        category: "compliance",
        type: "invoice_tracking_updated",
        label: `${invoiceType} Invoice Tracking Updated`,
        detail: `${status}${item.receivedVia ? ` · Received via ${String(item.receivedVia)}` : ""}`,
        date: readDate(item.updatedAt || item.createdAt),
        color: status === "Received" ? "emerald" : "amber",
        financialYear,
        badge: status,
        badgeColor: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
        entityId: String(item._id || ""),
        entityType: "invoice",
      });
    });

    uploads.forEach((record) => {
      const item = record as unknown as Record<string, unknown>;
      const financialYear = extractFinancialYear(item.financialYear);
      const quantity = sumCreditCategories(item);
      activities.push({
        id: `upload-${String(item._id || Math.random())}`,
        category: "compliance",
        type: "cpcb_upload_recorded",
        label: "CPCB Upload Recorded",
        detail: `${item.uploadType === "purchase" ? "Purchase" : "Sale"} data · ${quantity.toLocaleString("en-IN")} MT`,
        date: readDate(item.updatedAt || item.createdAt),
        color: "violet",
        financialYear,
        badge: `${quantity.toLocaleString("en-IN")} MT`,
        badgeColor: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
        entityId: String(item._id || ""),
        entityType: "upload",
      });
    });

    quotations.forEach((record) => {
      const item = record as unknown as Record<string, unknown>;
      const financialYear = extractFinancialYear(item.financialYear);
      const status = typeof item.status === "string" ? item.status : "Draft";
      activities.push({
        id: `quotation-${String(item._id || Math.random())}`,
        category: "financial",
        type: "quotation_updated",
        label: typeof item.quotationNumber === "string" && item.quotationNumber ? item.quotationNumber : "Quotation Updated",
        detail: `Quotation status: ${status}`,
        date: readDate(item.updatedAt || item.createdAt),
        color: status === "Accepted" ? "emerald" : "brand",
        financialYear,
        badge: status,
        badgeColor: status === "Accepted"
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
        entityId: String(item._id || ""),
        entityType: "quotation",
      });
    });

    documents.forEach((record) => {
      const item = record as unknown as Record<string, unknown>;
      if (persistedDocumentOriginIds.has(String(item._id || ""))) return;
      const documentSource = typeof item.source === "string" ? item.source : "manual-link";
      const documentLabel = documentSource === "website-upload"
        ? "Document Uploaded"
        : documentSource === "migration"
          ? "Document Migrated"
          : "Document Linked";
      activities.push({
        id: `document-${String(item._id || Math.random())}`,
        category: "documents",
        type: documentSource === "website-upload" ? "document_uploaded" : documentSource === "migration" ? "document_migrated" : "document_linked",
        label: documentLabel,
        detail: typeof item.documentName === "string" ? item.documentName : "Client document",
        date: readDate(item.updatedAt || item.uploadedDate || item.createdAt),
        color: "blue",
        badge: "Document",
        badgeColor: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
        entityId: String(item._id || ""),
        entityType: "document",
      });
    });

    billings.forEach((billing) => {
      const billingRecord = billing as unknown as Record<string, unknown>;
      const financialYear = extractFinancialYear(billingRecord.financialYear);
      const paymentStatus = typeof billingRecord.paymentStatus === "string" ? billingRecord.paymentStatus : "";
      activities.push({
        id: `billing-${String(billingRecord._id || financialYear || Math.random())}`,
        category: "financial",
        type: "billing_created",
        label: "Billing Created",
        detail: `Total: ${formatAmount(billingRecord.totalAmount)} · Paid: ${formatAmount(billingRecord.totalPaid)} · Pending: ${formatAmount(billingRecord.pendingAmount)}`,
        date: readDate(billingRecord.updatedAt || billingRecord.createdAt),
        color: "brand",
        financialYear,
        badge: paymentStatus || financialYear,
        badgeColor: paymentStatus === "Paid"
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          : paymentStatus === "Partial"
            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
        entityId: String(billingRecord._id || ""),
        entityType: "billing",
      });
    });

    payments.forEach((payment) => {
      const paymentRecord = payment as unknown as Record<string, unknown>;
      const financialYear = extractFinancialYear(paymentRecord.financialYear);
      const isAdvancePayment = paymentRecord.paymentType === "advance";
      activities.push({
        id: `payment-${String(paymentRecord._id || Math.random())}`,
        category: "financial",
        type: isAdvancePayment ? "advance_payment_received" : "payment_received",
        label: isAdvancePayment ? "Advance Payment Received" : "Payment Received",
        detail: `${isAdvancePayment ? "Advance of " : ""}${formatAmount(paymentRecord.amountPaid)} via ${String(paymentRecord.paymentMode || "-")}${paymentRecord.referenceNumber ? ` · Ref: ${String(paymentRecord.referenceNumber)}` : ""}`,
        date: readDate(paymentRecord.paymentDate || paymentRecord.createdAt),
        color: "emerald",
        financialYear,
        badge: financialYear,
        badgeColor: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
        entityId: String(paymentRecord._id || ""),
        entityType: "payment",
      });
    });

    emailLogs.forEach((emailLog) => {
      const emailRecord = emailLog as unknown as Record<string, unknown>;
      const emailType = typeof emailRecord.type === "string" ? emailRecord.type : "custom";
      const badge = emailTypeLabel[emailType] || emailTypeLabel.custom;
      const isDraft = emailRecord.status === "draft";
      const recipients = Array.isArray(emailRecord.to)
        ? emailRecord.to.filter((value): value is string => typeof value === "string")
        : [];
      activities.push({
        id: `email-${String(emailRecord._id || Math.random())}`,
        category: "communications",
        type: isDraft ? "email_draft" : "email_sent",
        label: typeof emailRecord.subject === "string" && emailRecord.subject.trim()
          ? emailRecord.subject
          : `${badge} ${isDraft ? "Draft" : "Sent"}`,
        detail: `To: ${recipients.slice(0, 2).join(", ")}${recipients.length > 2 ? ` +${recipients.length - 2} more` : ""}`,
        date: readDate(emailRecord.sentAt || emailRecord.createdAt),
        color: "violet",
        financialYear: extractFinancialYear(emailRecord.financialYear),
        badge,
        badgeColor: emailTypeBadgeColor[emailType] || emailTypeBadgeColor.custom,
        entityId: String(emailRecord._id || ""),
        entityType: "email",
      });
    });

    deletedRecords.forEach((record) => {
      const deletedRecord = record as unknown as Record<string, unknown>;
      const recordType = typeof deletedRecord.recordType === "string" ? deletedRecord.recordType : "unknown";
      if (
        recordType === "document" &&
        (
          persistedRelatedIds.has(String(deletedRecord._id || "")) ||
          persistedRelatedIds.has(String(deletedRecord.recordId || ""))
        )
      ) return;
      const rawData = deletedRecord.data && typeof deletedRecord.data === "object"
        ? deletedRecord.data as Record<string, unknown>
        : {};
      if (recordType === "document") {
        const source = rawData.source === "website-upload" ? "website-upload" : "manual-link";
        const originalDate = readDate(rawData.uploadedDate || rawData.createdAt);
        if (originalDate) {
          activities.push({
            id: `legacy-document-origin-${String(deletedRecord.recordId || deletedRecord._id || Math.random())}`,
            category: "documents",
            type: source === "website-upload" ? "document_uploaded" : "document_linked",
            label: source === "website-upload" ? "Document Uploaded" : "Document Linked",
            detail: typeof rawData.documentName === "string" ? rawData.documentName : "Client document",
            date: originalDate,
            color: source === "website-upload" ? "emerald" : "blue",
            badge: "Historical",
            badgeColor: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
          });
        }
      }
      const financialYear = extractFinancialYear(rawData.financialYear);
      const label = recycleBinLabels[recordType] || "Record moved to recycle bin";
      const detailParts = [
        typeof deletedRecord.label === "string" ? deletedRecord.label : "",
        typeof deletedRecord.subLabel === "string" ? deletedRecord.subLabel : "",
      ].filter(Boolean);

      activities.push({
        id: `trash-${String(deletedRecord._id || Math.random())}`,
        category: recordType === "document" ? "documents" : "system",
        type: `deleted_${recordType}`,
        label,
        detail: detailParts.join(" · "),
        date: readDate(deletedRecord.deletedAt),
        color: "rose",
        financialYear,
        badge: "Recycle Bin",
        badgeColor: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
        entityId: String(deletedRecord._id || ""),
        entityType: "trash",
        recordType,
        actionSearch: detailParts[0] || detailParts[1] || label,
      });
    });

    activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const latestEmailActivity = activities.find((activity) => activity.category === "communications") || null;
    const filteredActivities = applyActivityFilters(activities, { category, financialYear, range });
    const items = filteredActivities.slice(offset, offset + limit);

    return NextResponse.json({
      items,
      total: filteredActivities.length,
      hasMore: offset + items.length < filteredActivities.length,
      nextOffset: offset + items.length,
      latestEmailActivity,
    });
  } catch (error) {
    console.error("GET /api/activities:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
