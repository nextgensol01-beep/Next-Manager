import mongoose, { Schema } from "mongoose";
import {
  EMAIL_DELIVERY_SECURITY_DEFAULTS,
  type DeliveryPolicy,
} from "@/lib/email-delivery-security";
export type SecuritySettings = DeliveryPolicy & {
  key: string;
  version: number;
  approvalEmail?: string;
  approvalEmailVerifiedAt?: Date;
  sendPinHash?: string;
  updatedBy?: string;
};
const schema = new Schema<SecuritySettings>(
  {
    key: { type: String, default: "global", unique: true, required: true },
    version: { type: Number, default: 0 },
    draftProtection: {
      type: String,
      enum: ["confirmation", "sendPin", "emailOtp"],
      default: EMAIL_DELIVERY_SECURITY_DEFAULTS.draftProtection,
    },
    directSendProtection: {
      type: String,
      enum: ["emailOtp", "sendPin", "emailOtpAndPin"],
      default: EMAIL_DELIVERY_SECURITY_DEFAULTS.directSendProtection,
    },
    holdToSend: {
      type: Boolean,
      default: EMAIL_DELIVERY_SECURITY_DEFAULTS.holdToSend,
    },
    restrictDuplicateRecipients: {
      type: Boolean,
      default: EMAIL_DELIVERY_SECURITY_DEFAULTS.restrictDuplicateRecipients,
    },
    approvalEmail: { type: String, select: false },
    approvalEmailVerifiedAt: Date,
    sendPinHash: { type: String, select: false },
    otpExpiryMinutes: {
      type: Number,
      default: EMAIL_DELIVERY_SECURITY_DEFAULTS.otpExpiryMinutes,
      min: 2,
      max: 10,
    },
    otpResendCooldownSeconds: {
      type: Number,
      default: EMAIL_DELIVERY_SECURITY_DEFAULTS.otpResendCooldownSeconds,
      min: 30,
      max: 120,
    },
    otpMaxAttempts: {
      type: Number,
      default: EMAIL_DELIVERY_SECURITY_DEFAULTS.otpMaxAttempts,
      min: 3,
      max: 10,
    },
    largeBatchThreshold: {
      type: Number,
      default: EMAIL_DELIVERY_SECURITY_DEFAULTS.largeBatchThreshold,
      min: 1,
      max: 1000,
    },
    requireEmailOtpForLargeBatch: {
      type: Boolean,
      default: EMAIL_DELIVERY_SECURITY_DEFAULTS.requireEmailOtpForLargeBatch,
    },
    updatedBy: String,
  },
  { timestamps: true },
);
export default mongoose.models.EmailDeliverySecuritySettings ||
  mongoose.model<SecuritySettings>("EmailDeliverySecuritySettings", schema);
