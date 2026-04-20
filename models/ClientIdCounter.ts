import mongoose, { Document, Schema } from "mongoose";

export interface IClientIdCounter extends Document {
  category: string;
  prefix: string;
  seq: number;
  createdAt: Date;
  updatedAt: Date;
}

const ClientIdCounterSchema = new Schema<IClientIdCounter>(
  {
    category: { type: String, required: true, unique: true, trim: true },
    prefix: { type: String, required: true, trim: true },
    seq: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.ClientIdCounter ||
  mongoose.model<IClientIdCounter>("ClientIdCounter", ClientIdCounterSchema);
