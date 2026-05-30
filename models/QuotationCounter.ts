import mongoose, { Schema, Document } from "mongoose";

export interface IQuotationCounter extends Document {
  financialYear: string; // e.g. "2026-27"
  seq: number;
}

const QuotationCounterSchema = new Schema<IQuotationCounter>(
  {
    financialYear: { type: String, required: true, unique: true },
    seq: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default (mongoose.models.QuotationCounter as mongoose.Model<IQuotationCounter>) ||
  mongoose.model<IQuotationCounter>("QuotationCounter", QuotationCounterSchema);
