import "server-only";
import type { DeliveryBatch } from "@/lib/email-delivery-security";
import { deliveryCounts, type DeliveryJobSummary, type DeliveryJobAcceptance, type DeliveryItemStatus } from "@/lib/email-delivery-jobs";
import Campaign, { type DeliverySnapshot } from "@/models/TrackerEmailCampaign";
import Tracker from "@/models/ClientTracker";
import Gate from "@/models/EmailDeliverySecurityGate";
import { authorizeCampaign, loadSecuritySettings, securityAudit, type SecurityContext } from "./email-delivery-approval";
import { DeliverySecurityError } from "./email-delivery-crypto";

export type JobRecord = {
  _id: unknown; campaignId: string; trackerId: string; trackerName?: string; workflowName?: string;
  workflowId: string; mailKind: "initial" | "reminder"; mode: "send" | "draft"; status: string;
  createdAt?: Date; updatedAt?: Date; startedAt?: Date; lastProgressAt?: Date; completedAt?: Date;
  queuedAt?: Date; nextAttemptAt?: Date; jobError?: string; jobVersion?: number; snapshot?: DeliverySnapshot;
  authorizedBy?: string; createdBy?: string;
  authorizedAt?: Date; batchHash?: string; approvalId?: string;
  coordinatorTokenHash?: string; coordinatorLeaseUntil?: Date; coordinatorAcquiredAt?: Date;
  items: Array<{ status?: string; [key: string]: unknown }>;
};
const iso = (value: unknown): string | null => {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
};
// Covers initial HTTP/lease negotiation and a few status polls, not an ownership lease.
// queuedAt is written atomically at acceptance and never reset by status reads/re-acceptance.
export const DELIVERY_STARTUP_GRACE_MS = 30_000;
type DeliveryRuntime = { now: number; workerLeaseUntil?: Date; recoveryChecked: boolean };
export async function readDeliveryRuntime(): Promise<DeliveryRuntime> {
  const gate = await Gate.findOne({ key: "client-delivery" }).select("leaseUntil").lean<{ leaseUntil?: Date } | null>();
  return { now: Date.now(), workerLeaseUntil: gate?.leaseUntil, recoveryChecked: true };
}
export async function deliveryJobView(job: JobRecord) {
  return publicDeliveryJob(job, await readDeliveryRuntime());
}
export function publicDeliveryJob(job: JobRecord, runtime: DeliveryRuntime = { now: Date.now(), recoveryChecked: false }): DeliveryJobSummary {
  const now = runtime.now;
  const counts = deliveryCounts(job.items || []);
  let status = job.status as DeliveryJobSummary["status"];
  const needsHistoryRepair = (job.items || []).some(item => ["sent", "draft"].includes(item.status || "") && item.deliveryId && !item.historyRecordedAt);
  const hasController = Boolean(job.coordinatorLeaseUntil && +new Date(job.coordinatorLeaseUntil) > now);
  const workerRunning = Boolean(runtime.workerLeaseUntil && +new Date(runtime.workerLeaseUntil) > now);
  const acceptedAt = job.queuedAt ? +new Date(job.queuedAt) : 0;
  const starting = job.jobVersion === 2 && job.status === "queued" && !job.coordinatorAcquiredAt &&
    !job.startedAt && !job.lastProgressAt && !counts.processed && !counts.delivering &&
    acceptedAt > 0 && now >= acceptedAt && now < acceptedAt + DELIVERY_STARTUP_GRACE_MS;
  const resumable = [1, 2].includes(job.jobVersion || 0);
  if (!counts.pending && !counts.delivering && !needsHistoryRepair) status = counts.failed || counts.uncertain ? "completed_with_errors" : "completed";
  else if (!resumable) status = "paused_requires_attention";
  else if (!hasController && starting) status = "queued";
  else if (!hasController && workerRunning) status = "recovering";
  else if (!hasController && !["paused_daily_limit", "paused_requires_attention"].includes(status)) status = "interrupted";
  else if (needsHistoryRepair && !counts.pending && !hasController) status = "paused_requires_attention";
  return {
    ...counts, campaignId: job.campaignId, trackerId: job.trackerId,
    trackerName: job.trackerName || "Client tracker", workflowName: job.workflowName || "Email workflow",
    kind: job.mailKind, mode: job.mode, status, executionMode: job.jobVersion === 2 ? "browser" : "legacy",
    controllerLeaseExpiresAt: iso(job.coordinatorLeaseUntil), canResume: runtime.recoveryChecked && resumable && !hasController && !workerRunning && !starting && Boolean(counts.pending || counts.delivering || needsHistoryRepair), needsHistoryRepair: Boolean(needsHistoryRepair),
    observedAt: new Date(now).toISOString(),
    createdAt: iso(job.queuedAt || job.createdAt) || new Date(0).toISOString(),
    startedAt: iso(job.startedAt), updatedAt: new Date(Math.max(...[job.lastProgressAt, job.updatedAt, job.createdAt].map(value => value ? +new Date(value) : 0))).toISOString(),
    completedAt: iso(job.completedAt), message: job.jobError || (!resumable && counts.pending + counts.delivering ? "Older campaign: review its tracker email history before resuming." : null),
  };
}
export function ownedJobs(context: SecurityContext) {
  return { $or: [{ authorizedBy: context.owner }, { authorizedBy: null, createdBy: context.userEmail }] };
}
export const JOB_SUMMARY_FIELDS = "campaignId trackerId trackerName workflowName workflowId mailKind mode status jobVersion createdAt updatedAt queuedAt startedAt lastProgressAt completedAt jobError coordinatorLeaseUntil coordinatorAcquiredAt items.status items.deliveryId items.historyRecordedAt";
export async function findOwnedJob(context: SecurityContext, campaignId: string, includeItems = false) {
  const fields = JOB_SUMMARY_FIELDS + (includeItems ? " items.clientId items.companyName items.to items.cc items.subject items.error items.processedAt items.claimedAt items.deliveryId" : "");
  const job = await Campaign.findOne({ campaignId, ...ownedJobs(context) }).select(fields).lean<JobRecord | null>();
  if (!job) throw new DeliverySecurityError("This email delivery is unavailable.", 404, "DELIVERY_JOB_NOT_FOUND");
  return job;
}
export async function acceptDeliveryJob(context: SecurityContext, trackerId: string, batch: DeliveryBatch): Promise<DeliveryJobAcceptance> {
  const tracker = await Tracker.findById(trackerId).select("name status financialYear fields emailEnabled emailWorkflows").lean<{
    name: string; status: string; financialYear?: string; fields: DeliverySnapshot["fields"];
    emailEnabled?: boolean; emailWorkflows?: DeliverySnapshot["workflow"][];
  } | null>();
  const workflow = tracker?.emailWorkflows?.find(item => item.id === batch.workflowId);
  if (!tracker || tracker.status !== "active" || !tracker.emailEnabled || !workflow)
    throw new DeliverySecurityError("This tracker email workflow is unavailable.", 409);
  const authorized = await authorizeCampaign(context, trackerId, batch, await loadSecuritySettings());
  const already = await Campaign.findOne({ campaignId: batch.campaignId }).select(JOB_SUMMARY_FIELDS).lean<JobRecord | null>();
  if ([1, 2].includes(already?.jobVersion || 0)) {
    if (!already) throw new DeliverySecurityError("Campaign unavailable.", 404);
    // Explicit re-acceptance may adopt an old managed job, without changing its snapshot.
    if (already.jobVersion === 1) {
      await Campaign.updateOne({ _id: already._id, jobVersion: 1 }, { $set: { jobVersion: 2 } });
      already.jobVersion = 2;
    }
    return { outcome: "already_accepted", campaignId: batch.campaignId, job: await deliveryJobView(already) };
  }
  const snapshot: DeliverySnapshot = {
    trackerName: tracker.name, financialYear: tracker.financialYear, fields: tracker.fields, workflow,
    actor: { owner: context.owner, userId: context.userId, userEmail: context.userEmail },
  };
  // Authorization's consumed-operation recovery closes the pre-binding crash gap.
  // This single-document CAS atomically makes the immutable snapshot visible to workers.
  const accepted = await Campaign.findOneAndUpdate(
    { _id: authorized._id, jobVersion: { $nin: [1, 2] } },
    { $set: { jobVersion: 2, snapshot, trackerName: tracker.name, workflowName: workflow.name,
      status: "queued", queuedAt: new Date(), nextAttemptAt: new Date(), jobError: null } },
    { new: true },
  ).select(JOB_SUMMARY_FIELDS).lean<JobRecord | null>();
  const job = accepted || await findOwnedJob(context, batch.campaignId);
  if (![1, 2].includes(job.jobVersion || 0)) throw new DeliverySecurityError("Delivery was not accepted. Retry this same campaign.", 503, "DELIVERY_NOT_ACCEPTED");
  // Audit failure cannot turn a durably accepted job into a misleading rejected response.
  try { await securityAudit(context, "delivery_queued", { trackerId, workflowId: batch.workflowId, campaignId: batch.campaignId, mode: batch.mode, messageCount: batch.messages.length }); }
  catch { console.error("Email delivery queue audit could not be recorded."); }
  return { outcome: accepted ? "accepted" : "already_accepted", campaignId: batch.campaignId, job: await deliveryJobView(job) };
}
export function safeDeliveryError(error: unknown, status: string): string | null {
  if (status === "uncertain" || status === "delivering") return "Gmail outcome could not be confirmed. Review Gmail before retrying.";
  if (status !== "failed") return null;
  const text = String(error || "").toLowerCase();
  if (text.includes("attachment") || text.includes("document")) return "An attachment is unavailable or no longer authorized for this message.";
  if (text.includes("workflow conditions")) return "The client no longer matches this workflow's eligibility conditions.";
  if (text.includes("already sent")) return "An initial email was already sent to this client.";
  if (text.includes("has replied")) return "The client has replied; this reminder was not sent.";
  if (text.includes("seven days")) return "The seven-day reminder safety cooldown has not elapsed.";
  if (text.includes("not been sent")) return "An initial email must be sent before a reminder.";
  if (text.includes("no longer available")) return "The client is no longer available in this tracker.";
  if (text.includes("gmail rejected")) return "Gmail rejected this message. Review the recipient and Gmail account.";
  return "This message could not be processed. Review its email history for the next step.";
}
export function publicJobItem(item: JobRecord["items"][number], index: number) {
  const allowed = ["pending", "delivering", "sent", "draft", "failed", "uncertain"];
  const status = (!item.status ? "pending" : allowed.includes(item.status) ? item.status : "uncertain") as DeliveryItemStatus;
  return { index, clientId: String(item.clientId || ""), companyName: String(item.companyName || "Client"),
    to: Array.isArray(item.to) ? item.to.map(String) : [], cc: Array.isArray(item.cc) ? item.cc.map(String) : [],
    subject: String(item.subject || ""), status, error: safeDeliveryError(item.error, status),
    processedAt: iso(item.processedAt || item.claimedAt), gmailReference: item.deliveryId ? String(item.deliveryId) : null };
}
