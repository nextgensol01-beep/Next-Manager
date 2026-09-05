import mongoose, { Document, Schema } from "mongoose";
import type {
  ClientCustomFieldFormTab,
  ClientCustomFieldFormSection,
  ClientCustomFieldIcon,
  ClientCustomFieldProfileCluster,
  ClientCustomFieldProfileDisplay,
} from "@/lib/clientCustomFields";

export interface IClientCustomFieldGroup extends Document {
  key: string;
  label: string;
  description: string;
  icon: ClientCustomFieldIcon;
  showIcon: boolean;
  active: boolean;
  applicableCategories: string[];
  formTab: ClientCustomFieldFormTab;
  formSection: ClientCustomFieldFormSection;
  profileDisplay: Exclude<ClientCustomFieldProfileDisplay, "inline">;
  profileCluster: ClientCustomFieldProfileCluster;
  order: number;
  collapsible: boolean;
  defaultExpanded: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ClientCustomFieldGroupSchema = new Schema<IClientCustomFieldGroup>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    label: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    icon: {
      type: String,
      enum: ["fileText", "building", "hash", "user", "mapPin", "phone", "mail", "calendar", "lock", "shield"],
      default: "fileText",
    },
    showIcon: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
    applicableCategories: { type: [String], default: [] },
    formTab: { type: String, enum: ["basic", "portal"], default: "basic" },
    formSection: { type: String, enum: ["identity", "company", "contacts", "compliance", "portalCredentials"], default: "company" },
    profileDisplay: { type: String, enum: ["subsection", "card"], default: "subsection" },
    profileCluster: { type: String, enum: ["company", "contact", "compliance", "additional"], default: "additional" },
    order: { type: Number, default: 0 },
    collapsible: { type: Boolean, default: true },
    defaultExpanded: { type: Boolean, default: false },
  },
  { timestamps: true },
);

ClientCustomFieldGroupSchema.index({ active: 1, order: 1 });

const cachedClientCustomFieldGroup = mongoose.models.ClientCustomFieldGroup;
const cachedClientCustomFieldGroupIcon = cachedClientCustomFieldGroup?.schema.path("icon") as { enumValues?: string[] } | undefined;
if (cachedClientCustomFieldGroup && (
  !cachedClientCustomFieldGroup.schema.path("formSection") ||
  !cachedClientCustomFieldGroup.schema.path("showIcon") ||
  !cachedClientCustomFieldGroupIcon?.enumValues?.includes("lock")
)) {
  delete mongoose.models.ClientCustomFieldGroup;
}

export default mongoose.models.ClientCustomFieldGroup ||
  mongoose.model<IClientCustomFieldGroup>("ClientCustomFieldGroup", ClientCustomFieldGroupSchema);
