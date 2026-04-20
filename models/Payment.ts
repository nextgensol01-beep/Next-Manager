import mongoose, { Schema, Document } from "mongoose";

export interface IPayment extends Document {
  clientId: string;
  financialYear: string;
  amountPaid: number;
  paymentType: "billing" | "advance";
  paymentDate: Date;
  paymentMode: string;
  referenceNumber?: string;
  notes?: string;
  createdAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    clientId: { type: String, required: true, ref: "Client" },
    financialYear: { type: String, required: true },
    amountPaid: { type: Number, required: true },
    paymentType: { type: String, enum: ["billing", "advance"], default: "billing" },
    paymentDate: { type: Date, required: true },
    paymentMode: { type: String, required: true },
    referenceNumber: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.models.Payment ||
  mongoose.model<IPayment>("Payment", PaymentSchema);
