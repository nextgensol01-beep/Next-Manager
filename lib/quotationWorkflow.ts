import type { Types } from "mongoose";
import Quotation from "@/models/Quotation";
import {
  canChangeQuotationStatus,
  isTerminalQuotationStatus,
  type QuotationStatus,
} from "@/lib/quotationRules";

type ActivityEntry = {
  timestamp: Date;
  action: string;
  detail?: string;
};

type MutableQuotation = {
  _id: Types.ObjectId | string;
  status: QuotationStatus;
  sentAt?: Date | null;
  validTill?: Date | null;
  activities: ActivityEntry[];
};

export class QuotationWorkflowError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 409) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function applyQuotationStatusChange(
  quotation: MutableQuotation,
  nextStatus: QuotationStatus,
  reason?: string
) {
  const previousStatus = quotation.status;
  if (previousStatus === nextStatus) return false;

  if (isTerminalQuotationStatus(previousStatus)) {
    throw new QuotationWorkflowError(`${previousStatus} quotations are locked`);
  }

  if (!canChangeQuotationStatus(previousStatus, nextStatus)) {
    throw new QuotationWorkflowError(`Cannot change status from ${previousStatus} to ${nextStatus}`);
  }

  quotation.status = nextStatus;
  if (nextStatus === "Sent") quotation.sentAt = quotation.sentAt || new Date();
  quotation.activities.push({
    timestamp: new Date(),
    action: `Status changed to ${nextStatus}`,
    detail: reason || `From: ${previousStatus}`,
  });
  return true;
}

export async function expireStaleQuotations(filter: Record<string, unknown> = {}) {
  const now = new Date();
  const staleQuotations = await Quotation.find({
    ...filter,
    status: { $in: ["Sent", "Finalized"] },
    validTill: { $lt: now, $ne: null },
  });

  for (const quotation of staleQuotations) {
    quotation.status = "Expired";
    quotation.activities.push({
      timestamp: now,
      action: "Quotation expired",
      detail: quotation.validTill
        ? `Valid till ${quotation.validTill.toLocaleDateString("en-IN")}`
        : "Validity period ended",
    });
    await quotation.save();
  }

  return staleQuotations.length;
}
