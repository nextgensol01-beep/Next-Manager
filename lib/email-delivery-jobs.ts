/** Public job contracts. Never include approval tokens, message HTML or worker credentials. */
export type DeliveryItemStatus = "pending" | "delivering" | "sent" | "draft" | "failed" | "uncertain";
export type DeliveryJobStatus = "queued" | "processing" | "recovering" | "interrupted" | "paused_daily_limit" | "paused_requires_attention" | "completed" | "completed_with_errors";
export type DeliveryCounts = {
  total: number; processed: number; sent: number; drafts: number; failed: number;
  uncertain: number; pending: number; delivering: number;
};
export type DeliveryJobSummary = DeliveryCounts & {
  campaignId: string; trackerId: string; trackerName: string; workflowName: string;
  kind: "initial" | "reminder"; mode: "send" | "draft"; status: DeliveryJobStatus;
  createdAt: string; startedAt: string | null; updatedAt: string; completedAt: string | null;
  message: string | null; executionMode: "browser" | "legacy";
  controllerLeaseExpiresAt: string | null; canResume: boolean; needsHistoryRepair: boolean;
  /** Server observation time orders derived lease-expiry states with the same persisted updatedAt. */
  observedAt?: string;
};
export type DeliveryJobAcceptance = {
  outcome: "accepted" | "already_accepted";
  campaignId: string;
  job: DeliveryJobSummary;
};
export type DeliveryJobItem = {
  index: number; clientId: string; companyName: string; to: string[]; cc: string[];
  subject: string; status: DeliveryItemStatus; error: string | null;
  processedAt: string | null; gmailReference: string | null;
};
export const ACTIVE_DELIVERY_STATUSES: DeliveryJobStatus[] = ["queued", "processing", "recovering"];
export const isDeliveryActive = (status: DeliveryJobStatus) => ACTIVE_DELIVERY_STATUSES.includes(status);
export type DeliveryCoordinatorClaim = { job: DeliveryJobSummary; coordinatorToken?: string };
export type DeliveryBatchProgress = { state: "processing" | "busy" | "paused" | "done" | "attention" | "unavailable"; job: DeliveryJobSummary; retryAfterMs?: number };
export function deliveryCounts(items: Array<{ status?: string }>): DeliveryCounts {
  const counts: DeliveryCounts = { total: items.length, processed: 0, sent: 0, drafts: 0, failed: 0, uncertain: 0, pending: 0, delivering: 0 };
  for (const item of items) {
    if (!item.status || item.status === "pending") counts.pending++;
    else if (item.status === "sent") counts.sent++;
    else if (item.status === "draft") counts.drafts++;
    else if (item.status === "failed") counts.failed++;
    else if (item.status === "delivering") counts.delivering++;
    else counts.uncertain++;
  }
  counts.processed = counts.sent + counts.drafts + counts.failed + counts.uncertain;
  return counts;
}
export function deliveryOutcomeLabel(job: DeliveryJobSummary): string {
  if (job.status === "queued") return job.mode === "draft" ? "Starting draft creation…" : "Starting email delivery…";
  if (job.status === "recovering") return "Checking saved delivery…";
  if (job.status === "interrupted") return "Delivery interrupted · resume remaining";
  if (job.status === "processing") return job.mode === "draft" ? "Creating Gmail drafts" : "Sending emails…";
  if (job.status === "paused_daily_limit") return "Paused · daily allowance reached";
  if (job.status === "paused_requires_attention") return "Delivery needs attention";
  const success = job.mode === "draft" ? `${job.drafts} ${job.drafts === 1 ? "draft" : "drafts"} created` : `${job.sent} ${job.sent === 1 ? "email" : "emails"} sent`;
  return [success, job.failed ? `${job.failed} failed` : "", job.uncertain ? `${job.uncertain} uncertain` : ""].filter(Boolean).join(" · ");
}
