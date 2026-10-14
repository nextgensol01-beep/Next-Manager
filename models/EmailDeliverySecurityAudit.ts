import mongoose, { Schema } from "mongoose";
const schema = new Schema(
  {
    event: { type: String, required: true },
    userId: String,
    userEmail: String,
    trackerId: String,
    workflowId: String,
    campaignId: String,
    approvalId: String,
    mode: String,
    mailKind: String,
    messageCount: Number,
    approvalMethod: String,
    result: String,
    ip: String,
    userAgent: String,
    details: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
schema.index({ createdAt: -1, _id: -1 });
export default mongoose.models.EmailDeliverySecurityAudit ||
  mongoose.model("EmailDeliverySecurityAudit", schema);
