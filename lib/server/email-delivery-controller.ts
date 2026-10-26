import "server-only";
import { createHash, randomBytes } from "node:crypto";
import Campaign from "@/models/TrackerEmailCampaign";
import { acquireDeliveryLease, securityAudit, type SecurityContext } from "./email-delivery-approval";
import { DeliverySecurityError } from "./email-delivery-crypto";
import { ownedJobs, deliveryJobView, publicDeliveryJob, JOB_SUMMARY_FIELDS, type JobRecord } from "./email-delivery-jobs";
import { deliveryMemory } from "./email-delivery-memory";
import { processDeliveryJob } from "./tracker-email-worker";
import type { DeliveryCoordinatorClaim, DeliveryBatchProgress } from "@/lib/email-delivery-jobs";

const LEASE_MS = 120_000;
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
const internalFields = JOB_SUMMARY_FIELDS + " authorizedAt batchHash approvalId authorizedBy createdBy +coordinatorTokenHash";
async function ownedCampaign(context: SecurityContext, campaignId: string) {
  const job = await Campaign.findOne({ campaignId, ...ownedJobs(context) }).select(internalFields).lean<JobRecord | null>();
  if (!job) throw new DeliverySecurityError("This email delivery is unavailable.", 404, "DELIVERY_JOB_NOT_FOUND");
  if (![1, 2].includes(job.jobVersion || 0) || !job.authorizedAt || !job.batchHash || !job.approvalId || job.authorizedBy !== context.owner ||
    !(await Campaign.exists({ _id: job._id, snapshot: { $ne: null } })))
    throw new DeliverySecurityError("This campaign needs exact-batch authorization from its tracker before it can run.", 403, "DELIVERY_APPROVAL_REQUIRED");
  return job;
}

/** Only an explicit acceptance/resume interaction calls this. Status reads never start work. */
export async function claimDeliveryCoordinator(context: SecurityContext, campaignId: string): Promise<DeliveryCoordinatorClaim> {
  const existing = await ownedCampaign(context, campaignId);
  const summary = publicDeliveryJob(existing);
  if (!summary.pending && !summary.delivering && !summary.needsHistoryRepair) return { job: summary };
  const gate = await acquireDeliveryLease();
  try {
    const token = randomBytes(32).toString("base64url");
    const job = await Campaign.findOneAndUpdate({ _id: existing._id, ...ownedJobs(context),
      $and: [{ $or: [{ coordinatorTokenHash: null }, { coordinatorLeaseUntil: { $lte: new Date() } }] }],
    }, { $set: { jobVersion: 2, coordinatorTokenHash: digest(token), coordinatorLeaseUntil: new Date(Date.now() + LEASE_MS),
      coordinatorAcquiredAt: new Date(), status: "queued", jobError: null, nextAttemptAt: new Date() } }, { new: true }).select(internalFields).lean<JobRecord | null>();
    if (!job) throw new DeliverySecurityError("Another browser is coordinating this campaign. Wait for it to finish or its lease to expire before resuming.", 409, "COORDINATOR_BUSY");
    // A browser disappearing cannot prove Gmail did not receive an active call.
    for (let index = 0; index < job.items.length; index++) {
      if (job.items[index].status !== "delivering") continue;
      await gate.renew();
      await Campaign.updateOne({ _id: job._id, coordinatorTokenHash: digest(token), ["items." + index + ".status"]: "delivering" },
        { $set: { ["items." + index + ".status"]: "uncertain", ["items." + index + ".processedAt"]: new Date(),
          ["items." + index + ".error"]: "Interrupted Gmail attempt. Review Gmail before retrying." } });
      job.items[index].status = "uncertain";
    }
    await securityAudit(context, "delivery_resume_requested", { trackerId: job.trackerId, campaignId });
    return { job: await deliveryJobView(job), coordinatorToken: token };
  } finally { await gate.release(); }
}

export async function processBrowserDeliveryBatch(context: SecurityContext, campaignId: string, token: string): Promise<DeliveryBatchProgress> {
  await ownedCampaign(context, campaignId);
  const tokenHash = digest(token);
  const filter = { campaignId, ...ownedJobs(context), jobVersion: 2, coordinatorTokenHash: tokenHash, coordinatorLeaseUntil: { $gt: new Date() } };
  const reserved = await Campaign.updateOne(filter, { $set: { coordinatorLeaseUntil: new Date(Date.now() + LEASE_MS) } });
  if (!reserved.matchedCount) throw new DeliverySecurityError("This browser no longer owns delivery coordination. Review the saved campaign before resuming.", 409, "COORDINATOR_LOST");
  const assertOwnership = async () => {
    if (!(await Campaign.exists({ ...filter, coordinatorLeaseUntil: { $gt: new Date() } })))
      throw new DeliverySecurityError("Delivery coordination expired or changed.", 409, "COORDINATOR_LOST");
  };
  try {
    const result = await processDeliveryJob(campaignId, { assertOwnership });
    if (["done", "paused", "attention", "unavailable"].includes(result.state)) {
      await Campaign.updateOne({ campaignId, coordinatorTokenHash: tokenHash }, { $unset: { coordinatorTokenHash: 1, coordinatorLeaseUntil: 1 } });
    } else {
      await Campaign.updateOne({ campaignId, coordinatorTokenHash: tokenHash }, { $set: { coordinatorLeaseUntil: new Date(Date.now() + LEASE_MS) } });
    }
    return { state: result.state, job: await deliveryJobView(await ownedCampaign(context, campaignId)), ...(result.state === "busy" ? { retryAfterMs: 3000 } : {}) };
  } catch (error) {
    // An unknown response stops the browser loop; it never authorizes another batch.
    await Campaign.updateOne({ campaignId, coordinatorTokenHash: tokenHash }, { $set: { jobError: "Processing was interrupted. Wait for any current batch to settle, then explicitly resume remaining work." } });
    throw error;
  } finally {
    deliveryMemory("request.complete");
  }
}
