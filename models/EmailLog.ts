import mongoose, { Schema, Document } from "mongoose";

export interface IEmailLog extends Document {
  type:
    | "quotation"
    | "payment_reminder"
    | "annual_return_draft"
    | "custom"
    | "tracker";
  to: string[];
  subject: string;
  clientId?: string;
  clientName?: string;
  financialYear?: string;
  sentAt: Date;
  status: "sent" | "draft" | "failed";
  notes?: string;
  trackerId?: string;
  workflowId?: string;
  mailKind?: "initial" | "reminder";
  cc?: string[];
  renderedHtml?: string;
  renderedBody?: string;
  campaignId?: string;
  gmailMessageId?: string;
  gmailThreadId?: string;
  communicationStatus?: "sent" | "replied";
  repliedAt?: Date;
  gmailReplyMessageId?: string;
  attachments?: Array<{
    documentId: string;
    filename: string;
    mimeType: string;
    fileSize: number;
  }>;
}

const EmailLogSchema = new Schema<IEmailLog>(
  {
    type: {
      type: String,
      enum: [
        "quotation",
        "payment_reminder",
        "annual_return_draft",
        "custom",
        "tracker",
      ],
      required: true,
    },
    to: { type: [String], required: true },
    subject: { type: String, required: true },
    clientId: { type: String, default: "" },
    clientName: { type: String, default: "" },
    financialYear: { type: String, default: "" },
    sentAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["sent", "draft", "failed"],
      default: "sent",
    },
    notes: { type: String, default: "" },
    trackerId: { type: String, default: "", index: true },
    workflowId: { type: String, default: "" },
    mailKind: {
      type: String,
      enum: ["initial", "reminder"],
      default: "initial",
    },
    cc: { type: [String], default: [] },
    renderedHtml: { type: String, default: "" },
    renderedBody: { type: String, default: "" },
    campaignId: { type: String, default: "", index: true },
    gmailMessageId: String,
    gmailThreadId: String,
    communicationStatus: {
      type: String,
      enum: ["sent", "replied"],
      default: "sent",
    },
    repliedAt: Date,
    gmailReplyMessageId: String,
    attachments: {
      type: [
        {
          documentId: String,
          filename: String,
          mimeType: String,
          fileSize: Number,
          _id: false,
        },
      ],
      default: [],
    },
  },
  { timestamps: false },
);

EmailLogSchema.index({ sentAt: -1 });

export default mongoose.models.EmailLog ||
  mongoose.model<IEmailLog>("EmailLog", EmailLogSchema);
