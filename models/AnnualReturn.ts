import mongoose, { Schema, Document } from "mongoose";

export type ReturnStatus = "Pending" | "In Progress" | "Filed" | "Verified";

export interface IAnnualReturn extends Document {
  clientId: string;
  financialYear: string;
  status: ReturnStatus;
  filingDate?: Date;
  acknowledgeNumber?: string;
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AnnualReturnSchema = new Schema<IAnnualReturn>(
  {
    clientId:            { type: String, required: true },
    financialYear:       { type: String, required: true },
    status:              { type: String, enum: ["Pending", "In Progress", "Filed", "Verified"], default: "Pending" },
    filingDate:          { type: Date, default: null },
    acknowledgeNumber:   { type: String, default: "" },
    remarks:             { type: String, default: "" },
  },
  { timestamps: true }
);

AnnualReturnSchema.index({ clientId: 1, financialYear: 1 }, { unique: true });

export default mongoose.models.AnnualReturn ||
  mongoose.model<IAnnualReturn>("AnnualReturn", AnnualReturnSchema);
