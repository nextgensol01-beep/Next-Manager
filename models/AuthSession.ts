import mongoose, { Schema, Document } from "mongoose";

export interface IAuthSession extends Document {
  sessionToken: string;
  userId: string;
  provider?: "credentials" | "google";
  userAgent?: string;
  ip?: string;
  expires: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AuthSessionSchema = new Schema<IAuthSession>(
  {
    sessionToken: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    provider: { type: String, enum: ["credentials", "google"], default: "credentials" },
    userAgent: { type: String, default: "" },
    ip: { type: String, default: "" },
    expires: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

export default mongoose.models.AuthSession ||
  mongoose.model<IAuthSession>("AuthSession", AuthSessionSchema);
