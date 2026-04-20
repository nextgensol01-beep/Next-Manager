import mongoose, { Schema, Document } from "mongoose";

// ── Shared per-entry structure for both generated credits and targets ──────
export type CreditTypeEnum = "RECYCLING" | "EOL";

export interface ITargetEntry {
  categoryId: string;   // "1" | "2" | "3" | "4"
  type: CreditTypeEnum;
  value: number;
}

// Re-use same shape for PWP generated credits
export type IGeneratedEntry = ITargetEntry;

export interface IFinancialYear extends Document {
  clientId: string;
  financialYear: string;

  // PWP — new structured generated credits array (per category + type)
  generated?: IGeneratedEntry[];

  // PWP — legacy flat generated (kept for backward compat)
  cat1Generated?: number;
  cat2Generated?: number;
  cat3Generated?: number;
  cat4Generated?: number;

  // PIBO — new structured targets array
  targets?: ITargetEntry[];

  // PIBO — legacy flat targets (kept for reports export compat)
  cat1Target?: number;
  cat2Target?: number;
  cat3Target?: number;
  cat4Target?: number;

  // Older legacy aliases
  creditsCat1?: number; creditsCat2?: number;
  creditsCat3?: number; creditsCat4?: number;
  targetCat1?: number;  targetCat2?: number;
  targetCat3?: number;  targetCat4?: number;
  availableCredits?: number;
  targetAmount?: number;
  createdAt: Date;
}

const EntrySchema = new Schema<ITargetEntry>(
  {
    categoryId: { type: String, required: true },
    type:       { type: String, enum: ["RECYCLING", "EOL"], required: true },
    value:      { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const FinancialYearSchema = new Schema<IFinancialYear>(
  {
    clientId:      { type: String, required: true, ref: "Client" },
    financialYear: { type: String, required: true },

    // New structured generated (PWP)
    generated: { type: [EntrySchema], default: [] },

    // Legacy flat generated (PWP) — kept in sync, used by reports
    cat1Generated: { type: Number, default: 0 },
    cat2Generated: { type: Number, default: 0 },
    cat3Generated: { type: Number, default: 0 },
    cat4Generated: { type: Number, default: 0 },

    // New structured targets (PIBO)
    targets: { type: [EntrySchema], default: [] },

    // Legacy flat targets (PIBO) — kept in sync, used by reports
    cat1Target: { type: Number, default: 0 },
    cat2Target: { type: Number, default: 0 },
    cat3Target: { type: Number, default: 0 },
    cat4Target: { type: Number, default: 0 },

    // Older aliases
    creditsCat1: { type: Number, default: 0 },
    creditsCat2: { type: Number, default: 0 },
    creditsCat3: { type: Number, default: 0 },
    creditsCat4: { type: Number, default: 0 },
    targetCat1:  { type: Number, default: 0 },
    targetCat2:  { type: Number, default: 0 },
    targetCat3:  { type: Number, default: 0 },
    targetCat4:  { type: Number, default: 0 },
    availableCredits: { type: Number, default: 0 },
    targetAmount:     { type: Number, default: 0 },
  },
  { timestamps: true }
);

FinancialYearSchema.index({ clientId: 1, financialYear: 1 }, { unique: true });

export default mongoose.models.FinancialYear ||
  mongoose.model<IFinancialYear>("FinancialYear", FinancialYearSchema);
