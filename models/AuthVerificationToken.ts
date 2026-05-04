import mongoose, { Schema, Document } from "mongoose";

export interface IAuthVerificationToken extends Document {
  identifier: string;
  token: string;
  expires: Date;
}

const AuthVerificationTokenSchema = new Schema<IAuthVerificationToken>(
  {
    identifier: { type: String, required: true },
    token: { type: String, required: true },
    expires: { type: Date, required: true },
  },
  { timestamps: true }
);

AuthVerificationTokenSchema.index({ identifier: 1, token: 1 }, { unique: true });

export default mongoose.models.AuthVerificationToken ||
  mongoose.model<IAuthVerificationToken>("AuthVerificationToken", AuthVerificationTokenSchema);
