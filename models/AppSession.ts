import mongoose, { Schema, Document } from "mongoose";

export interface IAppSession extends Document {
  sessionToken: string;
  userEmail: string;
  userName: string;
  provider: "credentials" | "google";
  userAgent?: string;
  ip?: string;
  expires: Date;
  createdAt: Date;
}

const AppSessionSchema = new Schema<IAppSession>(
  {
    sessionToken: { type: String, required: true, unique: true },
    userEmail:    { type: String, required: true },
    userName:     { type: String, required: true },
    provider:     { type: String, enum: ["credentials", "google"], required: true },
    userAgent:    { type: String, default: "" },
    ip:           { type: String, default: "" },
    expires:      { type: Date, required: true },
  },
  { timestamps: true }
);

// Auto-remove expired sessions
AppSessionSchema.index({ expires: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.AppSession ||
  mongoose.model<IAppSession>("AppSession", AppSessionSchema);
