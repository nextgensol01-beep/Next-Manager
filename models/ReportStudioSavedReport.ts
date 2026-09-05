import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IReportStudioSavedReport extends Document {
  userId: Types.ObjectId;
  name: string;
  config: Record<string, unknown>;
  migrationKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReportStudioSavedReportSchema = new Schema<IReportStudioSavedReport>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  config: { type: Schema.Types.Mixed, required: true },
  migrationKey: { type: String, trim: true, maxlength: 160 },
}, { timestamps: true });

ReportStudioSavedReportSchema.index({ userId: 1, updatedAt: -1 });
ReportStudioSavedReportSchema.index(
  { userId: 1, migrationKey: 1 },
  { unique: true, sparse: true },
);

export default mongoose.models.ReportStudioSavedReport
  || mongoose.model<IReportStudioSavedReport>("ReportStudioSavedReport", ReportStudioSavedReportSchema);
