import mongoose, { Schema, Document as MongoDoc } from "mongoose";

export interface IDocument extends MongoDoc {
  clientId: string;
  documentName: string;
  driveLink: string;
  uploadedDate: Date;
  createdAt: Date;
}

const DocumentSchema = new Schema<IDocument>(
  {
    clientId: { type: String, required: true, ref: "Client" },
    documentName: { type: String, required: true },
    driveLink: { type: String, required: true },
    uploadedDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.models.Document ||
  mongoose.model<IDocument>("Document", DocumentSchema);
