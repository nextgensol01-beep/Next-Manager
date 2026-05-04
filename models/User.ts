import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";

export type UserStatus = "active" | "disabled" | "pending" | "rejected";
export type UserRole = "admin" | "user";
export type UserLoginMethod = "password" | "google";
export type UserGoogleStatus = "none" | "pending" | "approved" | "rejected";

export interface IUserFinancialYearSettings {
  enabled: boolean;
  defaultFinancialYear?: string | null;
  lastKnownCurrentFy?: string | null;
  pendingReminderCurrentFy?: string | null;
}

export interface IUser extends Document {
  name: string;
  email?: string | null;
  loginId?: string | null;
  password?: string;
  googleId?: string;
  image?: string;
  emailVerified?: Date | null;
  status: UserStatus;
  role: UserRole;
  loginMethods: UserLoginMethod[];
  googleStatus: UserGoogleStatus;
  googleRequestedAt?: Date | null;
  googleApprovedAt?: Date | null;
  lastLoginAt?: Date | null;
  lastLoginProvider?: "credentials" | "google" | null;
  lastLoginIp?: string | null;
  lastLoginUserAgent?: string | null;
  financialYearSettings?: IUserFinancialYearSettings;
  createdAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    loginId: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    password: { type: String, default: null },
    googleId: { type: String, default: null, sparse: true },
    image: { type: String },
    emailVerified: { type: Date, default: null },
    status: {
      type: String,
      enum: ["active", "disabled", "pending", "rejected"],
      default: "active",
      index: true,
    },
    role: { type: String, enum: ["admin", "user"], default: "user", index: true },
    loginMethods: {
      type: [String],
      enum: ["password", "google"],
      default: ["password"],
    },
    googleStatus: {
      type: String,
      enum: ["none", "pending", "approved", "rejected"],
      default: "none",
      index: true,
    },
    googleRequestedAt: { type: Date, default: null },
    googleApprovedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    lastLoginProvider: { type: String, enum: ["credentials", "google"], default: null },
    lastLoginIp: { type: String, default: "" },
    lastLoginUserAgent: { type: String, default: "" },
    financialYearSettings: {
      enabled: { type: Boolean, default: false },
      defaultFinancialYear: { type: String, default: null },
      lastKnownCurrentFy: { type: String, default: null },
      pendingReminderCurrentFy: { type: String, default: null },
    },
  },
  { timestamps: true }
);

// Hash password before save
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

UserSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
