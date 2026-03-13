import mongoose, { Schema, Document } from "mongoose";

export interface IEmailLog extends Document {
  type: "quotation" | "payment_reminder" | "annual_return_draft" | "custom";
  to: string[];
  subject: string;
  clientId?: string;
  clientName?: string;
  financialYear?: string;
  sentAt: Date;
  status: "sent" | "draft" | "failed";
  notes?: string;
}

const EmailLogSchema = new Schema<IEmailLog>({
  type:          { type: String, enum: ["quotation", "payment_reminder", "annual_return_draft", "custom"], required: true },
  to:            { type: [String], required: true },
  subject:       { type: String, required: true },
  clientId:      { type: String, default: "" },
  clientName:    { type: String, default: "" },
  financialYear: { type: String, default: "" },
  sentAt:        { type: Date, default: Date.now },
  status:        { type: String, enum: ["sent", "draft", "failed"], default: "sent" },
  notes:         { type: String, default: "" },
}, { timestamps: false });

export default mongoose.models.EmailLog || mongoose.model<IEmailLog>("EmailLog", EmailLogSchema);
