import mongoose, { Schema, type Document } from "mongoose";

export interface ITrackerEmailCampaign extends Document {
  campaignId: string;
  trackerId: string;
  workflowId: string;
  mailKind: "initial" | "reminder";
  mode: "draft" | "send";
  status:
    | "processing"
    | "paused_daily_limit"
    | "completed"
    | "completed_with_errors";
  total: number;
  completed: number;
  failed: number;
  items: unknown[];
  createdBy?: string;
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
    attachments: [{ documentId: String, _id: false }],
    status: {
      type: String,
      enum: ["pending", "draft", "sent", "failed"],
      default: "pending",
    },
    error: String,
    deliveryId: String,
  },
  { _id: false },
);
const TrackerEmailCampaignSchema = new Schema<ITrackerEmailCampaign>(
  {
    campaignId: { type: String, required: true, unique: true, index: true },
    trackerId: { type: String, required: true, index: true },
    workflowId: { type: String, required: true },
    mailKind: { type: String, enum: ["initial", "reminder"], required: true },
    mode: { type: String, enum: ["draft", "send"], required: true },
    status: {
      type: String,
      enum: [
        "processing",
        "paused_daily_limit",
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
  },
  { timestamps: true },
);
TrackerEmailCampaignSchema.index({ trackerId: 1, createdAt: -1 });
export default mongoose.models.TrackerEmailCampaign ||
  mongoose.model<ITrackerEmailCampaign>(
    "TrackerEmailCampaign",
    TrackerEmailCampaignSchema,
  );
