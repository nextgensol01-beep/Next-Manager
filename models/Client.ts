import mongoose, { Schema, Document } from "mongoose";
import type { ClientCustomFieldValues } from "@/lib/clientCustomFields";

export interface IClient extends Document {
  clientId: string;
  companyName: string;
  legalName?: string;
  category: "PWP" | "Producer" | "Importer" | "Brand Owner" | "SIMP";
  state: string;
  address?: string;
  gstNumber?: string;
  registrationNumber?: string;
  cpcbLoginId?: string;
  cpcbPassword?: string;
  otpMobileNumber?: string;
  customFields?: ClientCustomFieldValues;
  createdAt: Date;
}

const ClientSchema = new Schema<IClient>(
  {
    clientId: { type: String, required: true, unique: true, trim: true },
    companyName: { type: String, required: true, trim: true },
    legalName: { type: String, trim: true, default: "" },
    category: { type: String, required: true, enum: ["PWP", "Producer", "Importer", "Brand Owner", "SIMP"] },
    state: { type: String, required: true, trim: true },
    address: { type: String, default: "" },
    gstNumber: { type: String, trim: true, default: "" },
    registrationNumber: { type: String, trim: true, default: "" },
    cpcbLoginId: { type: String, trim: true, default: "" },
    cpcbPassword: { type: String, default: "" },
    otpMobileNumber: { type: String, trim: true, default: "" },
    customFields: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

if (
  mongoose.models.Client &&
  (!mongoose.models.Client.schema.path("customFields") || !mongoose.models.Client.schema.path("legalName"))
) {
  delete mongoose.models.Client;
}

export default mongoose.models.Client || mongoose.model<IClient>("Client", ClientSchema);
