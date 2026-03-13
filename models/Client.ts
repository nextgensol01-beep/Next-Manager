import mongoose, { Schema, Document } from "mongoose";

export interface IClient extends Document {
  clientId: string;
  companyName: string;
  category: "PWP" | "Producer" | "Importer" | "Brand Owner" | "SIMP";
  contactIds?: string[];       // multiple contacts
  contactId?: string;          // legacy single contact
  contactPerson?: string;      // legacy text fallback
  email?: string;
  mobile?: string;
  state: string;
  address?: string;
  gstNumber?: string;
  registrationNumber?: string;
  cpcbLoginId?: string;
  cpcbPassword?: string;
  otpMobileNumber?: string;
  createdAt: Date;
}

const ClientSchema = new Schema<IClient>(
  {
    clientId: { type: String, required: true, unique: true, trim: true },
    companyName: { type: String, required: true, trim: true },
    category: { type: String, required: true, enum: ["PWP", "Producer", "Importer", "Brand Owner", "SIMP"] },
    contactIds: { type: [String], default: [] },
    contactId: { type: String, default: null },     // legacy
    contactPerson: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },
    mobile: { type: String, trim: true, default: "" },
    state: { type: String, required: true, trim: true },
    address: { type: String, default: "" },
    gstNumber: { type: String, trim: true, default: "" },
    registrationNumber: { type: String, trim: true, default: "" },
    cpcbLoginId: { type: String, trim: true, default: "" },
    cpcbPassword: { type: String, default: "" },
    otpMobileNumber: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

export default mongoose.models.Client || mongoose.model<IClient>("Client", ClientSchema);
