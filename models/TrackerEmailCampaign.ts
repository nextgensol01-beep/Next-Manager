import mongoose, { Schema, type Document } from "mongoose";
import type { TrackerEmailWorkflow, TrackerField } from "@/lib/clientTrackers";
import type { DeliveryJobStatus } from "@/lib/email-delivery-jobs";

export type DeliverySnapshot = {
  trackerName: string;
  financialYear?: string;
  fields: TrackerField[];
  workflow: TrackerEmailWorkflow;
  actor: { owner: string; userId?: string; userEmail: string };
};

export interface ITrackerEmailCampaign extends Document {
  campaignId: string;
  trackerId: string;
  trackerName?: string;
  workflowName?: string;
  workflowId: string;
  mailKind: "initial" | "reminder";
  mode: "draft" | "send";
  status: DeliveryJobStatus;
  total: number;
  completed: number;
  failed: number;
  items: unknown[];
  createdBy?: string;
  batchHash?: string;
  approvalId?: string;
  authorizedBy?: string;
  authorizedAt?: Date;
  jobVersion?: number;
  snapshot?: DeliverySnapshot;
  queuedAt?: Date;
  startedAt?: Date;
  lastProgressAt?: Date;
  completedAt?: Date;
  nextAttemptAt?: Date;
  lastWorkerToken?: string;
  jobError?: string;
  coordinatorTokenHash?: string;
  coordinatorLeaseUntil?: Date;
  coordinatorAcquiredAt?: Date;
}
const ItemSchema = new Schema(
  {
    entryId: String,
    clientId: String,
    companyName: String,
    to: [String],
    cc: [String],
    subject: String,
    html: String,
    attachmentSnapshot: { type: String, default: undefined },
    attachments: [{ documentId: String, _id: false }],
    status: {
      type: String,
      enum: ["pending", "delivering", "uncertain", "draft", "sent", "failed"],
      default: "pending",
    },
    error: String,
    deliveryId: String,
    deliveryThreadId: String,
    draftMessageId: String,
    draftResolution: { type: String, enum: ["review", "sent", "discarded"] },
    draftCheckedAt: Date,
    draftSuggestion: { messageId: String, threadId: String, sentAt: Date },
    claimedAt: Date,
    deliveryClaimToken: String,
    historyRecordedAt: Date,
    processedAt: Date,
  },
  { _id: false },
);
const TrackerEmailCampaignSchema = new Schema<ITrackerEmailCampaign>(
  {
    campaignId: { type: String, required: true, unique: true, index: true },
    trackerId: { type: String, required: true, index: true },
    trackerName: String,
    workflowName: String,
    workflowId: { type: String, required: true },
    mailKind: { type: String, enum: ["initial", "reminder"], required: true },
    mode: { type: String, enum: ["draft", "send"], required: true },
    status: {
      type: String,
      enum: [
        "queued",
        "processing",
        "recovering",
        "interrupted",
        "paused_daily_limit",
        "paused_requires_attention",
        "completed",
        "completed_with_errors",
      ],
      default: "processing",
    },
    total: Number,
    completed: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    items: { type: [ItemSchema], default: [] },
    createdBy: String,
    batchHash: String,
    approvalId: String,
    authorizedBy: String,
    authorizedAt: Date,
    jobVersion: Number,
    // Written only by the acceptance service; the worker never reads mutable template content.
    snapshot: { type: Schema.Types.Mixed, select: false },
    queuedAt: Date,
    startedAt: Date,
    lastProgressAt: Date,
    completedAt: Date,
    nextAttemptAt: Date,
    lastWorkerToken: { type: String, select: false },
    jobError: String,
    coordinatorTokenHash: { type: String, select: false },
    coordinatorLeaseUntil: Date,
    coordinatorAcquiredAt: Date,
  },
  { timestamps: true },
);
TrackerEmailCampaignSchema.index({ trackerId: 1, createdAt: -1 });
TrackerEmailCampaignSchema.index({ trackerId: 1, workflowId: 1, mode: 1, "items.clientId": 1, "items.status": 1, "items.claimedAt": 1 });
TrackerEmailCampaignSchema.index({ jobVersion: 1, status: 1, nextAttemptAt: 1, queuedAt: 1 });
TrackerEmailCampaignSchema.index({ authorizedBy: 1, createdAt: -1 });
export default mongoose.models.TrackerEmailCampaign ||
  mongoose.model<ITrackerEmailCampaign>(
    "TrackerEmailCampaign",
    TrackerEmailCampaignSchema,
  );
