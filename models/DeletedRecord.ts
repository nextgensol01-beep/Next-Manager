import mongoose, { Schema, Document } from "mongoose";

export interface IDeletedRecord extends Document {
  recordType: "client" | "contact" | "creditTransaction" | "financialYear" | "billing" | "payment" | "annualReturn" | "uploadRecord" | "invoice";
  recordId: string;
  label: string;         // human-readable name e.g. "ABC Pvt Ltd (PWP-001)"
  subLabel?: string;     // extra context e.g. "FY 2024-25"
  data: Record<string, unknown>;  // full snapshot of deleted document
  deletedAt: Date;
}

const DeletedRecordSchema = new Schema<IDeletedRecord>(
  {
    recordType: { type: String, required: true, index: true },
    recordId:   { type: String, required: true },
    label:      { type: String, required: true },
    subLabel:   { type: String, default: "" },
    data:       { type: Schema.Types.Mixed, required: true },
    deletedAt:  { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// Auto-expire after 90 days
DeletedRecordSchema.index({ deletedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export default mongoose.models.DeletedRecord ||
  mongoose.model<IDeletedRecord>("DeletedRecord", DeletedRecordSchema);
