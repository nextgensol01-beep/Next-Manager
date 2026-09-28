import mongoose, { Document, Schema } from "mongoose";
import type {
  ClientTrackerCategory,
  TrackerEmailWorkflow,
  TrackerField,
  TrackerSavedView,
} from "@/lib/clientTrackers";

export interface IClientTracker extends Document {
  name: string;
  description?: string;
  financialYear?: string;
  fields: TrackerField[];
  clientColumns?: string[];
  clientCategories?: ClientTrackerCategory[];
  /** A fixed list is intentional; category-sync follows changes to selected categories. */
  clientMembershipMode?: "snapshot" | "categorySync";
  clientIds: string[];
  status: "active" | "archived";
  createdBy?: string;
  emailEnabled?: boolean;
  emailWorkflows?: TrackerEmailWorkflow[];
  savedViews?: TrackerSavedView[];
  createdAt: Date;
  updatedAt: Date;
}

const TrackerFieldSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: [
        "status",
        "toggle",
        "select",
        "text",
        "longText",
        "multiSelect",
        "tags",
        "number",
        "percentage",
        "quantity",
        "currency",
        "progress",
        "date",
      ],
      required: true,
    },
    options: { type: [String], default: undefined },
    optionColors: { type: Schema.Types.Mixed, default: {} },
    required: { type: Boolean, default: false },
    dataLink: { type: Schema.Types.Mixed, default: undefined },
    computed: { type: Schema.Types.Mixed, default: undefined },
    unit: { type: String, trim: true, maxlength: 20 },
  },
  { _id: false },
);

const ClientTrackerSchema = new Schema<IClientTracker>(
  {
    name: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, trim: true, maxlength: 1000 },
    financialYear: { type: String, trim: true },
    fields: { type: [TrackerFieldSchema], required: true },
    clientColumns: { type: [String], default: ["state"] },
    clientCategories: { type: [String], default: [] },
    clientMembershipMode: {
      type: String,
      enum: ["snapshot", "categorySync"],
      default: "snapshot",
    },
    clientIds: { type: [String], required: true, default: [] },
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
      index: true,
    },
    createdBy: { type: String, trim: true },
    emailEnabled: { type: Boolean, default: false },
    emailWorkflows: { type: [Schema.Types.Mixed], default: [] },
    savedViews: { type: [Schema.Types.Mixed], default: [] },
  },
  { timestamps: true },
);

ClientTrackerSchema.index({ status: 1, updatedAt: -1 });

const existingTrackerFieldsPath = mongoose.models.ClientTracker?.schema.path(
  "fields",
) as unknown as {
  schema?: { path: (name: string) => { enumValues?: unknown[] } | undefined };
};
const existingTrackerTypeValues =
  existingTrackerFieldsPath?.schema?.path("type")?.enumValues;

if (
  mongoose.models.ClientTracker &&
  (!mongoose.models.ClientTracker.schema.path("clientCategories") ||
    !mongoose.models.ClientTracker.schema.path("clientMembershipMode") ||
    !mongoose.models.ClientTracker.schema.path("savedViews") ||
    !Array.isArray(existingTrackerTypeValues) ||
    !existingTrackerTypeValues.includes("longText"))
) {
  delete mongoose.models.ClientTracker;
}

export default mongoose.models.ClientTracker ||
  mongoose.model<IClientTracker>("ClientTracker", ClientTrackerSchema);
