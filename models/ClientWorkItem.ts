import mongoose, { Schema, Document } from "mongoose";

export type ClientWorkItemKind = "task" | "reminder" | "follow_up" | "call" | "meeting";

export interface IClientWorkItem extends Document {
  clientId: string;
  financialYear?: string;
  kind: ClientWorkItemKind;
  title: string;
  details?: string;
  status: "open" | "completed" | "cancelled";
  priority: "low" | "normal" | "high";
  ownerEmail?: string;
  dueAt?: Date;
  completedAt?: Date;
  createdBy?: string;
  trackerId?: string;
  campaignId?: string;
  emailLogId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ClientWorkItemSchema = new Schema<IClientWorkItem>({
  clientId: { type: String, required: true, index: true },
  financialYear: { type: String, trim: true },
  kind: { type: String, enum: ["task", "reminder", "follow_up", "call", "meeting"], required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 240 },
  details: { type: String, trim: true, maxlength: 4000 },
  status: { type: String, enum: ["open", "completed", "cancelled"], default: "open", index: true },
  priority: { type: String, enum: ["low", "normal", "high"], default: "normal" },
  ownerEmail: { type: String, trim: true },
  dueAt: Date,
  completedAt: Date,
  createdBy: { type: String, trim: true },
  trackerId: { type: String, index: true },
  campaignId: String,
  emailLogId: String,
}, { timestamps: true });

ClientWorkItemSchema.index({ clientId: 1, kind: 1, status: 1, dueAt: 1 });

export default mongoose.models.ClientWorkItem || mongoose.model<IClientWorkItem>("ClientWorkItem", ClientWorkItemSchema);
