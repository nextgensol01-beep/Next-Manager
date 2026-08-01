import mongoose, { Schema, Document } from "mongoose";
import type {
  ClientCustomFieldFormSection,
  ClientCustomFieldFormTab,
  ClientCustomFieldIcon,
  ClientCustomFieldProfileCluster,
  ClientCustomFieldProfileDisplay,
  ClientCustomFieldProfilePosition,
  ClientCustomFieldType,
} from "@/lib/clientCustomFields";

export interface IClientCustomField extends Document {
  key: string;
  label: string;
  type: ClientCustomFieldType;
  searchable: boolean;
  required: boolean;
  active: boolean;
  showInForm: boolean;
  showInProfile: boolean;
  includeInExport: boolean;
  applicableCategories: string[];
  groupId?: string;
  formTab: ClientCustomFieldFormTab;
  formSection: ClientCustomFieldFormSection;
  profileDisplay: ClientCustomFieldProfileDisplay;
  profileCluster: ClientCustomFieldProfileCluster;
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
    type: { type: String, enum: ["text", "number", "date", "checkbox", "password", "url", "textarea"], default: "text" },
    searchable: { type: Boolean, default: false },
    required: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    showInForm: { type: Boolean, default: true },
    showInProfile: { type: Boolean, default: true },
    includeInExport: { type: Boolean, default: true },
    applicableCategories: { type: [String], default: [] },
    groupId: { type: String, trim: true, default: "" },
    formTab: { type: String, enum: ["basic", "portal"], default: "basic" },
    formSection: {
      type: String,
      enum: ["identity", "company", "contacts", "compliance", "portalCredentials"],
      default: "company",
    },
    profileDisplay: { type: String, enum: ["inline", "subsection", "card"], default: "inline" },
    profileCluster: {
      type: String,
      enum: ["company", "contact", "compliance", "additional"],
      default: "additional",
    },
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

if (mongoose.models.ClientCustomField && !mongoose.models.ClientCustomField.schema.path("formTab")) {
  delete mongoose.models.ClientCustomField;
}

export default mongoose.models.ClientCustomField ||
  mongoose.model<IClientCustomField>("ClientCustomField", ClientCustomFieldSchema);
