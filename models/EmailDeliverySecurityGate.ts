import mongoose, { Schema } from "mongoose";
/** Atomic, database-backed rolling rate windows and delivery leases. */
const schema = new Schema(
  {
    key: { type: String, unique: true, required: true },
    events: { type: [Date], default: [] },
    token: String,
    leaseUntil: Date,
    cleanupAt: Date,
  },
  { timestamps: true },
);
schema.index({ cleanupAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.models.EmailDeliverySecurityGate ||
  mongoose.model("EmailDeliverySecurityGate", schema);
