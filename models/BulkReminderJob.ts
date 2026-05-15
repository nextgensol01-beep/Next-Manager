import mongoose, { Schema, Document } from "mongoose";

export interface IBulkReminderRecipient {
  clientId: string;
  clientName: string;
  email: string;
  financialYear: string;
  pendingAmount: number;
  totalAmount: number;
  totalPaid: number;
  status: "pending" | "sent" | "failed" | "skipped";
  error?: string;
  sentAt?: Date;
}

export interface IBulkReminderJob extends Document {
  fy: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  recipients: IBulkReminderRecipient[];
  delayMs: number;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
}

const RecipientSchema = new Schema<IBulkReminderRecipient>({
  clientId:      { type: String, required: true },
  clientName:    { type: String, required: true },
  email:         { type: String, required: true },
  financialYear: { type: String, required: true },
  pendingAmount: { type: Number, required: true },
  totalAmount:   { type: Number, required: true },
  totalPaid:     { type: Number, required: true },
  status:        { type: String, enum: ["pending", "sent", "failed", "skipped"], default: "pending" },
  error:         { type: String },
  sentAt:        { type: Date },
}, { _id: false });

const BulkReminderJobSchema = new Schema<IBulkReminderJob>({
  fy:           { type: String, required: true },
  createdAt:    { type: Date, default: Date.now },
  startedAt:    { type: Date },
  completedAt:  { type: Date },
  status:       { type: String, enum: ["pending", "running", "completed", "failed", "cancelled"], default: "pending" },
  recipients:   { type: [RecipientSchema], required: true },
  delayMs:      { type: Number, default: 5000 },
  totalCount:   { type: Number, required: true },
  sentCount:    { type: Number, default: 0 },
  failedCount:  { type: Number, default: 0 },
  skippedCount: { type: Number, default: 0 },
}, { timestamps: false });

export default mongoose.models.BulkReminderJob ||
  mongoose.model<IBulkReminderJob>("BulkReminderJob", BulkReminderJobSchema);
