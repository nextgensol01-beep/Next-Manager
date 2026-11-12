import mongoose, { Schema } from "mongoose";

// Challenges contain only keyed hashes and prepared changes (never plaintext passwords).
const challenge = new Schema({
  _id: String,
  userId: { type: String, required: true, index: true },
  binding: { type: String, required: true },
  action: { type: String, required: true },
  codeHash: { type: String, required: true },
  newCodeHash: String,
  targetEmail: String,
  passwordHash: { type: String, select: false },
  securityVersion: { type: Number, default: 0 },
  provider: String,
  attempts: { type: Number, default: 0 },
  consumed: { type: Boolean, default: false },
  expires: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
}, { timestamps: true });

const gate = new Schema({
  _id: String,
  count: { type: Number, default: 0 },
  expires: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

const config = new Schema({
  _id: String,
  adminUserId: String,
  recoveryEmail: String,
  recoveryVerifiedAt: Date,
});

const device = new Schema({
  _id: String,
  userId: String,
  location: String,
  expires: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

export const SecurityChallenge = mongoose.models.SecurityChallenge || mongoose.model("SecurityChallenge", challenge);
export const SecurityGate = mongoose.models.SecurityGate || mongoose.model("SecurityGate", gate);
export const AccountSecurityConfig = mongoose.models.AccountSecurityConfig || mongoose.model("AccountSecurityConfig", config);
export const KnownAuthDevice = mongoose.models.KnownAuthDevice || mongoose.model("KnownAuthDevice", device);
