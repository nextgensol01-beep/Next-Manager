import mongoose, { Schema, Document } from "mongoose";

export interface IEmailMessageTemplate extends Document {
  name: string;
  bodyHtml: string;
  bodyText: string;
  createdAt: Date;
  updatedAt: Date;
}

const EmailMessageTemplateSchema = new Schema<IEmailMessageTemplate>({
  name:     { type: String, required: true, trim: true, maxlength: 80 },
  bodyHtml: { type: String, required: true, maxlength: 8000 },
  bodyText: { type: String, required: true, maxlength: 4000 },
}, { timestamps: true });

EmailMessageTemplateSchema.index({ updatedAt: -1 });

export default mongoose.models.EmailMessageTemplate ||
  mongoose.model<IEmailMessageTemplate>("EmailMessageTemplate", EmailMessageTemplateSchema);
