import mongoose, { Schema } from "mongoose";

const FieldSchema = new Schema({
  label: { type: String, required: true, maxlength: 100 },
  scope: { type: String, enum: ["client", "financial-year"], required: true },
  type: { type: String, enum: ["boolean", "select", "text", "number", "date"], required: true },
  options: [String],
  createdBy: { type: String, required: true },
}, { timestamps: true });

const ValueSchema = new Schema({
  fieldId: { type: String, required: true },
  clientId: { type: String, required: true },
  financialYear: { type: String, default: "" },
  value: { type: Schema.Types.Mixed, default: null },
  updatedBy: { type: String, required: true },
}, { timestamps: true });
ValueSchema.index({ fieldId: 1, clientId: 1, financialYear: 1 }, { unique: true });

export const ReportManualFieldModel = mongoose.models.ReportManualField || mongoose.model("ReportManualField", FieldSchema);
export const ReportManualValueModel = mongoose.models.ReportManualValue || mongoose.model("ReportManualValue", ValueSchema);
