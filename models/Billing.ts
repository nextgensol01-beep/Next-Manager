import mongoose, { Schema, Document } from "mongoose";

export interface IBillingTargetBreakdownRow {
  categoryId: string;
  categoryLabel: string;
  type: "RECYCLING" | "EOL";
  quantity: number;
  rate: number;
  taxableAmount: number;
  gstPercent: number;
  gstAmount: number;
  totalAmount: number;
  rateSource?: "transaction" | "manual";
}

export interface IBilling extends Document {
  clientId: string;
  financialYear: string;
  govtCharges: number;
  consultancyCharges: number;
  targetCharges: number;
  otherCharges: number;
  totalAmount: number;
  dueDate?: Date;
  targetBreakdown?: IBillingTargetBreakdownRow[];
  notes?: string;
  // Invoice tracking
  invoiceCreated: boolean;
  invoiceNumber?: string;
  invoiceDate?: Date;
  invoiceAmount?: number;
  createdAt: Date;
}

const BillingTargetBreakdownSchema = new Schema<IBillingTargetBreakdownRow>(
  {
    categoryId: { type: String, required: true },
    categoryLabel: { type: String, default: "" },
    type: { type: String, enum: ["RECYCLING", "EOL"], required: true },
    quantity: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },
    taxableAmount: { type: Number, default: 0 },
    gstPercent: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    rateSource: { type: String, enum: ["transaction", "manual"], default: "manual" },
  },
  { _id: false }
);

const BillingSchema = new Schema<IBilling>(
  {
    clientId: { type: String, required: true, ref: "Client" },
    financialYear: { type: String, required: true },
    govtCharges: { type: Number, default: 0 },
    consultancyCharges: { type: Number, default: 0 },
    targetCharges: { type: Number, default: 0 },
    otherCharges: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    dueDate: { type: Date, default: null },
    targetBreakdown: { type: [BillingTargetBreakdownSchema], default: [] },
    notes: { type: String, default: "" },
    // Invoice tracking
    invoiceCreated: { type: Boolean, default: false },
    invoiceNumber: { type: String, trim: true, default: "" },
    invoiceDate: { type: Date, default: null },
    invoiceAmount: { type: Number, default: null },
  },
  { timestamps: true }
);

BillingSchema.pre("save", function (next) {
  this.totalAmount =
    this.govtCharges +
    this.consultancyCharges +
    this.targetCharges +
    this.otherCharges;
  next();
});

BillingSchema.index({ clientId: 1, financialYear: 1 }, { unique: true });

export default mongoose.models.Billing ||
  mongoose.model<IBilling>("Billing", BillingSchema);
