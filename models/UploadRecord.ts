import mongoose, { Schema, Document } from "mongoose";

export interface IUploadRecord extends Document {
  clientId: string;
  financialYear: string;
  cat1?: number;
  cat2?: number;
  cat3?: number;
  cat4?: number;
  createdAt: Date;
}

const UploadRecordSchema = new Schema<IUploadRecord>(
  {
    clientId: { type: String, required: true, ref: "Client" },
    financialYear: { type: String, required: true },
    cat1: { type: Number, default: 0 },
    cat2: { type: Number, default: 0 },
    cat3: { type: Number, default: 0 },
    cat4: { type: Number, default: 0 },
  },
  { timestamps: true }
);

UploadRecordSchema.index({ clientId: 1, financialYear: 1 });

export default mongoose.models.UploadRecord ||
  mongoose.model<IUploadRecord>("UploadRecord", UploadRecordSchema);
