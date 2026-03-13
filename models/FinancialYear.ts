import mongoose, { Schema, Document } from "mongoose";

export interface IFinancialYear extends Document {
  clientId: string;
  financialYear: string;
  // PWP — credits generated per category
  cat1Generated?: number;
  cat2Generated?: number;
  cat3Generated?: number;
  cat4Generated?: number;
  // PIBO — targets per category
  cat1Target?: number;
  cat2Target?: number;
  cat3Target?: number;
  cat4Target?: number;
  // Legacy field aliases (kept so old records don't break)
  creditsCat1?: number; creditsCat2?: number; creditsCat3?: number; creditsCat4?: number;
  targetCat1?: number;  targetCat2?: number;  targetCat3?: number;  targetCat4?: number;
  availableCredits?: number;
  targetAmount?: number;
  createdAt: Date;
}

const FinancialYearSchema = new Schema<IFinancialYear>(
  {
    clientId: { type: String, required: true, ref: "Client" },
    financialYear: { type: String, required: true },
    // New canonical field names
    cat1Generated: { type: Number, default: 0 },
    cat2Generated: { type: Number, default: 0 },
    cat3Generated: { type: Number, default: 0 },
    cat4Generated: { type: Number, default: 0 },
    cat1Target: { type: Number, default: 0 },
    cat2Target: { type: Number, default: 0 },
    cat3Target: { type: Number, default: 0 },
    cat4Target: { type: Number, default: 0 },
    // Legacy aliases
    creditsCat1: { type: Number, default: 0 }, creditsCat2: { type: Number, default: 0 },
    creditsCat3: { type: Number, default: 0 }, creditsCat4: { type: Number, default: 0 },
    targetCat1:  { type: Number, default: 0 }, targetCat2:  { type: Number, default: 0 },
    targetCat3:  { type: Number, default: 0 }, targetCat4:  { type: Number, default: 0 },
    availableCredits: { type: Number, default: 0 },
    targetAmount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

FinancialYearSchema.index({ clientId: 1, financialYear: 1 }, { unique: true });

export default mongoose.models.FinancialYear ||
  mongoose.model<IFinancialYear>("FinancialYear", FinancialYearSchema);
