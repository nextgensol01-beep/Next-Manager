import type { Types } from "mongoose";
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
  acceptedAt?: Date | null;
  rejectedAt?: Date | null;
  revisionRequestedAt?: Date | null;
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
  const changedAt = new Date();
  if (nextStatus === "Sent") quotation.sentAt = quotation.sentAt || changedAt;
  if (nextStatus === "Accepted") quotation.acceptedAt = quotation.acceptedAt || changedAt;
  if (nextStatus === "Rejected") quotation.rejectedAt = quotation.rejectedAt || changedAt;
  if (nextStatus === "RevisionRequested") quotation.revisionRequestedAt = quotation.revisionRequestedAt || changedAt;
  quotation.activities.push({
    timestamp: changedAt,
    action: `Status changed to ${nextStatus}`,
    detail: reason || `From: ${previousStatus}`,
  });
  return true;
}

export async function expireStaleQuotations(filter: Record<string, unknown> = {}) {
  // Retained as a compatibility hook for existing callers. Quotations are no
  // longer changed automatically from a date: work can remain active across
  // financial years and completion is represented by an explicit status.
  void filter;
  return 0;
}
