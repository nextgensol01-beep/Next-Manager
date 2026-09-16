import mongoose, { Schema, Document } from "mongoose";

export interface IRevisionItem {
  description: string;
  category: string;
  type: string;
  quantity: number;
  rate: number;
  gstPercent: number;
  subtotal: number;
  gstAmount: number;
  totalAmount: number;
}

export interface IRevisionAdditionalItem {
  lineId?: string;
  description: string;
  quantity: number;
  rate: number;
  gstPercent: number;
  subtotal: number;
  gstAmount: number;
  totalAmount: number;
}

export interface IQuotationRevision extends Document {
  quotationId: string; // ref to Quotation._id
  revisionNumber: number; // 0, 1, 2…
  items: IRevisionItem[];
  additionalItems: IRevisionAdditionalItem[];
  consultationCharges: number;
  consultationGstPercent: number;
  consultationGstAmount: number;
  governmentFees: number;
  itemsSubtotal: number;
  itemsGst: number;
  additionalItemsSubtotal: number;
  additionalItemsGst: number;
  additionalItemsTotal: number;
  grandTotal: number;
  notes: string;
  validityDays: number;
  // locked snapshot — set once, never changed
  isFinalised: boolean;
  finalisedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RevisionItemSchema = new Schema<IRevisionItem>(
  {
    description: { type: String, default: "" },
    category: { type: String, default: "" },
    type: { type: String, default: "" },
    quantity: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },
    gstPercent: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
  },
  { _id: false }
);

const RevisionAdditionalItemSchema = new Schema<IRevisionAdditionalItem>(
  {
    lineId: { type: String, default: "", trim: true },
    description: { type: String, required: true, trim: true },
    quantity: { type: Number, default: 1 },
    rate: { type: Number, default: 0 },
    gstPercent: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
  },
  { _id: false }
);

const QuotationRevisionSchema = new Schema<IQuotationRevision>(
  {
    quotationId: { type: String, required: true, index: true },
    revisionNumber: { type: Number, required: true, default: 0 },
    items: { type: [RevisionItemSchema], default: [] },
    additionalItems: { type: [RevisionAdditionalItemSchema], default: [] },
    consultationCharges: { type: Number, default: 0 },
    consultationGstPercent: { type: Number, default: 0 },
    consultationGstAmount: { type: Number, default: 0 },
    governmentFees: { type: Number, default: 0 },
    itemsSubtotal: { type: Number, default: 0 },
    itemsGst: { type: Number, default: 0 },
    additionalItemsSubtotal: { type: Number, default: 0 },
    additionalItemsGst: { type: Number, default: 0 },
    additionalItemsTotal: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    notes: { type: String, default: "" },
    validityDays: { type: Number, default: 30 },
    isFinalised: { type: Boolean, default: false },
    finalisedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

QuotationRevisionSchema.index({ quotationId: 1, revisionNumber: 1 }, { unique: true });

export default (mongoose.models.QuotationRevision as mongoose.Model<IQuotationRevision>) ||
  mongoose.model<IQuotationRevision>("QuotationRevision", QuotationRevisionSchema);
