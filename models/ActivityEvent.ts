import mongoose, { Schema, Document } from "mongoose";

export interface IActivityEvent extends Document {
  clientId: string;
  category: "compliance" | "financial" | "communications" | "documents" | "system";
  type: string;
  label: string;
  detail: string;
  color: string;
  badge?: string;
  badgeColor?: string;
  financialYear?: string;
  entityId?: string;
  entityType?: string;
  recordType?: string;
  actionSearch?: string;
  relatedEntityIds: string[];
  actorEmail?: string;
  occurredAt: Date;
}

const ActivityEventSchema = new Schema<IActivityEvent>({
  clientId: { type: String, required: true, index: true },
  category: {
    type: String,
    required: true,
    enum: ["compliance", "financial", "communications", "documents", "system"],
    index: true,
  },
  type: { type: String, required: true },
  label: { type: String, required: true },
  detail: { type: String, required: true },
  color: { type: String, default: "blue" },
  badge: String,
  badgeColor: String,
  financialYear: String,
  entityId: String,
  entityType: String,
  recordType: String,
  actionSearch: String,
  relatedEntityIds: { type: [String], default: [] },
  actorEmail: String,
  occurredAt: { type: Date, default: Date.now, index: true },
}, { timestamps: false });

ActivityEventSchema.index({ clientId: 1, occurredAt: -1 });

export default mongoose.models.ActivityEvent ||
  mongoose.model<IActivityEvent>("ActivityEvent", ActivityEventSchema);
