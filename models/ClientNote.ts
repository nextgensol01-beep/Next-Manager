import mongoose, { Schema, Document } from "mongoose";

export interface IClientNote extends Document {
  clientId: string;
  financialYear?: string;
  body: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ClientNoteSchema = new Schema<IClientNote>({
  clientId: { type: String, required: true, index: true },
  financialYear: { type: String, trim: true },
  body: { type: String, required: true, trim: true, maxlength: 4000 },
  createdBy: { type: String, trim: true },
}, { timestamps: true });

ClientNoteSchema.index({ clientId: 1, createdAt: -1 });

export default mongoose.models.ClientNote || mongoose.model<IClientNote>("ClientNote", ClientNoteSchema);
