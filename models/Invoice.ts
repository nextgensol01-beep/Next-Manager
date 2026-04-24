import mongoose, { Schema, Document } from "mongoose";

export interface IInvoice extends Document {
  clientId: string;
  financialYear: string;
  invoiceType?: "sale" | "purchase";
  receivedVia?: "hardcopy" | "mail" | "whatsapp";
  fromDate: Date;
  toDate: Date;
  createdAt: Date;
}

const InvoiceSchema = new Schema<IInvoice>(
  {
    clientId: { type: String, required: true, ref: "Client" },
    financialYear: { type: String, required: true },
    invoiceType: { type: String, enum: ["sale", "purchase"] },
    receivedVia: { type: String, enum: ["hardcopy", "mail", "whatsapp"] },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
  },
  { timestamps: true }
);

InvoiceSchema.index({ clientId: 1, financialYear: 1 });

export default mongoose.models.Invoice ||
  mongoose.model<IInvoice>("Invoice", InvoiceSchema);
