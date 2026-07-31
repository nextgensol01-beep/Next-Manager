import mongoose, { Schema, Document as MongoDoc } from "mongoose";

export interface IDocument extends MongoDoc {
  clientId: string;
  documentName: string;
  driveLink: string;
  category?: "compliance" | "financial" | "invoices" | "certificates" | "other";
  storageType: "legacy-link" | "google-drive";
  driveFileId?: string;
  driveRelativePath?: string;
  originalDriveLink?: string;
  mimeType?: string;
  fileSize?: number;
  source: "manual-link" | "website-upload" | "migration";
  migrationStatus?: "legacy" | "pending" | "migrated" | "permission-required" | "unsupported" | "failed";
  uploadedDate: Date;
  createdAt: Date;
}

const DocumentSchema = new Schema<IDocument>(
  {
    clientId: { type: String, required: true, ref: "Client" },
    documentName: { type: String, required: true },
    driveLink: { type: String, required: true },
    category: {
      type: String,
      enum: ["compliance", "financial", "invoices", "certificates", "other"],
      index: true,
    },
    storageType: { type: String, enum: ["legacy-link", "google-drive"], default: "legacy-link" },
    driveFileId: { type: String },
    driveRelativePath: { type: String },
    originalDriveLink: { type: String },
    mimeType: { type: String },
    fileSize: { type: Number },
    source: { type: String, enum: ["manual-link", "website-upload", "migration"], default: "manual-link" },
    migrationStatus: {
      type: String,
      enum: ["legacy", "pending", "migrated", "permission-required", "unsupported", "failed"],
      default: "legacy",
    },
    uploadedDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

DocumentSchema.index({ clientId: 1, uploadedDate: -1 });

export default mongoose.models.Document ||
  mongoose.model<IDocument>("Document", DocumentSchema);
