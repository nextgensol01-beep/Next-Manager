import mongoose, { Schema, Document } from "mongoose";

export interface IContact extends Document {
  name: string;
  mobile: string;
  email?: string;
  designation?: string;
  notes?: string;
  createdAt: Date;
}

const ContactSchema = new Schema<IContact>(
  {
    name: { type: String, required: true, trim: true },
    mobile: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: "" },
    designation: { type: String, trim: true, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

ContactSchema.index({ name: "text", mobile: 1 });

export default mongoose.models.Contact ||
  mongoose.model<IContact>("Contact", ContactSchema);
