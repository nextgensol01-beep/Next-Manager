import mongoose, { Schema } from "mongoose";
import type { ApprovalMethod } from "@/lib/email-delivery-security";
export interface DeliveryApproval {
  approvalId: string;
  purpose: string;
  owner: string;
  createdByUserId?: string;
  createdByEmail: string;
  trackerId?: string;
  workflowId?: string;
  campaignId?: string;
  mailKind?: string;
  mode?: string;
  batchHash?: string;
  policyVersion: number;
  methodsRequired: ApprovalMethod[];
  method: string;
  messageCount: number;
  holdToSend: boolean;
  pendingEmail?: string;
  otpHash?: string;
  otpSentAt?: Date;
  otpExpiresAt?: Date;
  otpAttempts: number;
  otpResendCount: number;
  pinAttempts: number;
  otpVerifiedAt?: Date;
  pinVerifiedAt?: Date;
  verifiedAt?: Date;
  consumedAt?: Date;
  expiresAt: Date;
  cleanupAt: Date;
  status:
    | "pending"
    | "verified"
    | "consumed"
    | "expired"
    | "locked"
    | "cancelled";
}
const schema = new Schema<DeliveryApproval>(
  {
    approvalId: { type: String, unique: true, required: true },
    purpose: { type: String, required: true },
    owner: { type: String, required: true, index: true },
    createdByUserId: String,
    createdByEmail: String,
    trackerId: String,
    workflowId: String,
    campaignId: String,
    mailKind: String,
    mode: String,
    batchHash: String,
    policyVersion: Number,
    methodsRequired: [{ type: String, enum: ["emailOtp", "sendPin"] }],
    method: String,
    messageCount: Number,
    holdToSend: Boolean,
    pendingEmail: { type: String, select: false },
    otpHash: { type: String, select: false },
    otpSentAt: Date,
    otpExpiresAt: Date,
    otpAttempts: { type: Number, default: 0 },
    pinAttempts: { type: Number, default: 0 },
    otpResendCount: { type: Number, default: 0 },
    otpVerifiedAt: Date,
    pinVerifiedAt: Date,
    verifiedAt: Date,
    consumedAt: Date,
    expiresAt: { type: Date, required: true },
    cleanupAt: { type: Date, required: true },
    status: {
      type: String,
      enum: [
        "pending",
        "verified",
        "consumed",
        "expired",
        "locked",
        "cancelled",
      ],
      default: "pending",
    },
  },
  { timestamps: true },
);
schema.index({ cleanupAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ owner: 1, purpose: 1, campaignId: 1, createdAt: -1 });
export default mongoose.models.EmailDeliveryApproval ||
  mongoose.model<DeliveryApproval>("EmailDeliveryApproval", schema);
