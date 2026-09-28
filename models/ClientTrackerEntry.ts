import mongoose, { Document, Schema } from "mongoose";
import type { TrackerValues } from "@/lib/clientTrackers";

export interface IClientTrackerEntry extends Document {
  trackerId: mongoose.Types.ObjectId;
  clientId: string;
  values: TrackerValues;
  inScope: boolean;
  removedAt?: Date;
  removalReason?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ClientTrackerEntrySchema = new Schema<IClientTrackerEntry>(
  {
    trackerId: {
      type: Schema.Types.ObjectId,
      ref: "ClientTracker",
      required: true,
      index: true,
    },
    clientId: { type: String, required: true, index: true },
    values: { type: Schema.Types.Mixed, default: {} },
    inScope: { type: Boolean, default: true, index: true },
    removedAt: Date,
    removalReason: { type: String, trim: true },
    updatedBy: { type: String, trim: true },
  },
  { timestamps: true },
);

ClientTrackerEntrySchema.index({ trackerId: 1, clientId: 1 }, { unique: true });
ClientTrackerEntrySchema.index({ trackerId: 1, inScope: 1, updatedAt: -1 });
ClientTrackerEntrySchema.index({
  trackerId: 1,
  inScope: 1,
  updatedAt: -1,
  _id: -1,
});

export default mongoose.models.ClientTrackerEntry ||
  mongoose.model<IClientTrackerEntry>(
    "ClientTrackerEntry",
    ClientTrackerEntrySchema,
  );
