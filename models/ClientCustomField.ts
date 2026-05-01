import mongoose, { Schema, Document } from "mongoose";
import type { ClientCustomFieldIcon, ClientCustomFieldProfilePosition, ClientCustomFieldType } from "@/lib/clientCustomFields";

export interface IClientCustomField extends Document {
  key: string;
  label: string;
  type: ClientCustomFieldType;
  searchable: boolean;
  required: boolean;
  active: boolean;
  showInProfile: boolean;
  profilePosition: ClientCustomFieldProfilePosition;
  icon: ClientCustomFieldIcon;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const ClientCustomFieldSchema = new Schema<IClientCustomField>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    label: { type: String, required: true, trim: true },
    type: { type: String, enum: ["text", "number", "date", "checkbox"], default: "text" },
    searchable: { type: Boolean, default: false },
    required: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    showInProfile: { type: Boolean, default: true },
    profilePosition: {
      type: String,
      enum: ["beforeContact", "afterContact", "afterCompany"],
      default: "beforeContact",
    },
    icon: {
      type: String,
      enum: ["fileText", "building", "hash", "user", "mapPin", "phone", "mail", "calendar", "shield"],
      default: "fileText",
    },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

ClientCustomFieldSchema.index({ active: 1, order: 1 });

export default mongoose.models.ClientCustomField ||
  mongoose.model<IClientCustomField>("ClientCustomField", ClientCustomFieldSchema);
