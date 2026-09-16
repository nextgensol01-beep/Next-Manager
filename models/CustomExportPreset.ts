import mongoose, { Schema } from "mongoose";
const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true, index: true },
  name: { type: String, required: true, maxlength: 120 },
  config: { type: Schema.Types.Mixed, required: true },
  migrationKey: { type: String },
}, { timestamps: true });
schema.index({ userId: 1, migrationKey: 1 }, { unique: true, partialFilterExpression: { migrationKey: { $type: "string" } } });
export default mongoose.models.CustomExportPreset || mongoose.model("CustomExportPreset", schema);
