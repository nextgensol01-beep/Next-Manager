import mongoose, { Schema, Document } from "mongoose";
import { QUOTATION_STATUSES, type QuotationStatus } from "@/lib/quotationRules";
export type { QuotationStatus };

export interface IQuotationActivity {
  timestamp: Date;
  action: string;
  detail?: string;
}

export interface IQuotation extends Document {
  quotationNumber: string; // QT-2026-041
  clientId?: string;
  clientName: string;
  clientAddress?: string;
  clientGst?: string;
  clientState?: string;
  financialYear: string;
  status: QuotationStatus;
  currentRevisionNumber: number; // 0, 1, 2…
  validityDays: number;
  validTill?: Date;
  sentAt?: Date;
  activities: IQuotationActivity[];
  createdAt: Date;
  updatedAt: Date;
}

const ActivitySchema = new Schema<IQuotationActivity>(
  {
    timestamp: { type: Date, default: Date.now },
    action: { type: String, required: true },
    detail: { type: String, default: "" },
  },
  { _id: false }
);

const QuotationSchema = new Schema<IQuotation>(
  {
    quotationNumber: { type: String, default: "", trim: true },
    clientId: { type: String, trim: true, default: "" },
    clientName: { type: String, required: true, trim: true },
    clientAddress: { type: String, default: "" },
    clientGst: { type: String, default: "", trim: true },
    clientState: { type: String, default: "", trim: true },
    financialYear: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: QUOTATION_STATUSES,
      default: "Draft",
    },
    currentRevisionNumber: { type: Number, default: 0 },
    validityDays: { type: Number, default: 30 },
    validTill: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    activities: { type: [ActivitySchema], default: [] },
  },
  { timestamps: true }
);

QuotationSchema.index({ financialYear: 1, status: 1 });
QuotationSchema.index({ clientName: 1 });
QuotationSchema.index({ createdAt: -1 });

export default (mongoose.models.Quotation as mongoose.Model<IQuotation>) ||
  mongoose.model<IQuotation>("Quotation", QuotationSchema);
