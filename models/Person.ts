import mongoose, { Schema, Document } from "mongoose";

/**
 * Person — a real human being.
 * One person can be linked to multiple companies via ClientContact.
 * All phone numbers and emails belong to the person globally,
 * not tied to any specific company.
 */
export interface IPerson extends Document {
  name: string;
  phoneNumbers: string[];
  emails: string[];
  createdAt: Date;
  updatedAt: Date;
}

const PersonSchema = new Schema<IPerson>(
  {
    name:         { type: String, required: true, trim: true },
    phoneNumbers: { type: [String], default: [] },
    emails:       { type: [String], default: [], lowercase: true },
  },
  { timestamps: true }
);

// Text index for name search; index on phones/emails for dedup lookups
PersonSchema.index({ name: "text" });
PersonSchema.index({ phoneNumbers: 1 });
PersonSchema.index({ emails: 1 });

export default mongoose.models.Person ||
  mongoose.model<IPerson>("Person", PersonSchema);
