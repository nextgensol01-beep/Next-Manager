import mongoose, { Schema, Document } from "mongoose";

export type CreditType = "Recycling" | "EOL";

export interface ICreditTransaction extends Document {
  financialYear: string;
  fromClientId?: string;  // PWP selling credits
  toClientId?: string;    // PIBO receiving credits
  creditType: CreditType;
  // Category quantities (canonical names per spec)
  cat1Qty?: number; cat2Qty?: number; cat3Qty?: number; cat4Qty?: number;
  // Legacy aliases
  cat1?: number; cat2?: number; cat3?: number; cat4?: number;
  rateCat1?: number; rateCat2?: number; rateCat3?: number; rateCat4?: number;
  rate?: number;
  totalAmount: number;
  quantity?: number;
  date: Date;
  notes?: string;
  createdAt: Date;
}

const CreditTransactionSchema = new Schema<ICreditTransaction>(
  {
    financialYear: { type: String, required: true },
    fromClientId: { type: String, default: null },
    toClientId:   { type: String, default: null },
    creditType: { type: String, enum: ["Recycling", "EOL"], default: "Recycling" },
    // Canonical (no default — absence means "use legacy field")
    cat1Qty: { type: Number }, cat2Qty: { type: Number },
    cat3Qty: { type: Number }, cat4Qty: { type: Number },
    // Legacy
    cat1: { type: Number, default: 0 }, cat2: { type: Number, default: 0 },
    cat3: { type: Number, default: 0 }, cat4: { type: Number, default: 0 },
    rateCat1: { type: Number, default: 0 }, rateCat2: { type: Number, default: 0 },
    rateCat3: { type: Number, default: 0 }, rateCat4: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    quantity:    { type: Number, default: 0 },
    date: { type: Date, required: true },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

CreditTransactionSchema.index({ financialYear: 1, fromClientId: 1 });
CreditTransactionSchema.index({ financialYear: 1, toClientId: 1 });

export default mongoose.models.CreditTransaction ||
  mongoose.model<ICreditTransaction>("CreditTransaction", CreditTransactionSchema);
