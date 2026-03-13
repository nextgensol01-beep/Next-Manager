import mongoose, { Schema, Document } from "mongoose";

export interface IBilling extends Document {
  clientId: string;
  financialYear: string;
  govtCharges: number;
  consultancyCharges: number;
  targetCharges: number;
  otherCharges: number;
  totalAmount: number;
  notes?: string;
  createdAt: Date;
}

const BillingSchema = new Schema<IBilling>(
  {
    clientId: { type: String, required: true, ref: "Client" },
    financialYear: { type: String, required: true },
    govtCharges: { type: Number, default: 0 },
    consultancyCharges: { type: Number, default: 0 },
    targetCharges: { type: Number, default: 0 },
    otherCharges: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    notes: { type: String, default: "" },
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
