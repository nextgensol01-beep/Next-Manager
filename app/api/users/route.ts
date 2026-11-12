import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import {
  isAdminSession,
  normalizeLoginIdentifier,
} from "@/lib/authUsers";
import User, { type UserGoogleStatus, type UserStatus } from "@/models/User";
import AuthSession from "@/models/AuthSession";
import mongoose from "mongoose";
import { AccountSecurityError, requireSameOrigin } from "@/lib/server/account-security";

const STATUS_VALUES = new Set<UserStatus>(["active", "disabled", "pending", "rejected"]);
const GOOGLE_STATUS_VALUES = new Set<UserGoogleStatus>(["none", "pending", "approved", "rejected"]);
type DuplicateClause = { loginId: string } | { email: string };

async function requireAdmin(req?: NextRequest) {
  if (req) {
    try { requireSameOrigin(req); }
    catch (error) { return { session: null, response: NextResponse.json({ error: error instanceof AccountSecurityError ? error.message : "Forbidden" }, { status: 403 }) }; }
  }
  const session = await getServerSession(authOptions);
  if (!session) {
    return {
      session,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!(await isAdminSession(session))) {
    return {
      session,
      response: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
    };
  }

  return { session, response: null };
}

function serializeUser(user: {
  _id: { toString(): string };
  name?: string;
  email?: string | null;
  loginId?: string | null;
  googleId?: string | null;
  password?: string | null;
  image?: string | null;
  status?: UserStatus;
  role?: string;
  loginMethods?: string[];
  googleStatus?: UserGoogleStatus;
  googleRequestedAt?: Date | string | null;
  googleApprovedAt?: Date | string | null;
  lastLoginAt?: Date | string | null;
  lastLoginProvider?: "credentials" | "google" | null;
  lastLoginIp?: string | null;
  lastLoginUserAgent?: string | null;
  googleRequestLocation?: string;
  twoFactorEnabled?: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}, lastSession?: {
  provider?: "credentials" | "google";
  ip?: string;
  userAgent?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}) {
  const loginMethods = Array.isArray(user.loginMethods) ? user.loginMethods : [];
  const hasGoogle = loginMethods.includes("google") || Boolean(user.googleId);
  const hasPasswordLogin = Boolean(user.password);
  const googleStatus = user.googleStatus ||
    (hasGoogle && user.googleApprovedAt ? "approved" :
      hasGoogle && user.status === "pending" ? "pending" :
        hasGoogle && user.status === "rejected" ? "rejected" :
          "none");
  const createdFallback = user.createdAt || user.googleApprovedAt || user.googleRequestedAt || user.updatedAt || null;
  const lastLoginAt = user.lastLoginAt || lastSession?.createdAt || null;

  return {
    id: user._id.toString(),
    name: user.name || user.email || user.loginId || "User",
    email: user.email || "",
    loginId: user.loginId || "",
    loginMethod: hasGoogle && hasPasswordLogin ? "both" : hasGoogle ? "google" : "password",
    loginMethods,
    hasPasswordLogin,
    role: user.role || "user",
    status: user.status || "active",
    googleStatus,
    image: user.image || null,
    googleRequestedAt: user.googleRequestedAt || null,
    googleApprovedAt: user.googleApprovedAt || null,
    createdAt: createdFallback,
    originalCreatedAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
    lastLoginAt,
    lastLoginProvider: user.lastLoginProvider || lastSession?.provider || null,
    lastLoginIp: user.lastLoginIp || lastSession?.ip || "",
    lastLoginUserAgent: user.lastLoginUserAgent || lastSession?.userAgent || "",
    googleRequestLocation: user.googleRequestLocation || "Unknown",
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
  };
}

export async function GET() {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  await connectDB();

  const users = await User.find({})
    .select("+password")
    .sort({ status: 1, createdAt: -1 })
    .lean();
  const sessions = await AuthSession.find({
    userId: { $in: users.map((user) => String(user._id)) },
  })
    .sort({ createdAt: -1 })
    .lean() as unknown as Array<{
      userId: string;
      provider?: "credentials" | "google";
      ip?: string;
      userAgent?: string;
      createdAt?: Date;
      updatedAt?: Date;
    }>;
  const latestSessionByUserId = new Map<string, typeof sessions[number]>();
  for (const session of sessions) {
    const userId = String(session.userId);
    if (!latestSessionByUserId.has(userId)) latestSessionByUserId.set(userId, session);
  }

  return NextResponse.json({
    users: (users as unknown as Parameters<typeof serializeUser>[0][])
      .map((user) => serializeUser(user, latestSessionByUserId.get(user._id.toString()))),
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard.response) return guard.response;

  await connectDB();

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? normalizeLoginIdentifier(body.email) : "";
  const loginId = typeof body?.loginId === "string" ? normalizeLoginIdentifier(body.loginId) : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const loginMethod = body?.loginMethod === "google" ? "google" : "password";
  if (password && (password.length < 12 || Buffer.byteLength(password) > 72)) return NextResponse.json({ error: "Passwords require at least 12 characters and at most 72 UTF-8 bytes" }, { status: 400 });

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  if (loginMethod === "password" && (!loginId || !password.trim())) {
    return NextResponse.json({ error: "Login ID and password are required" }, { status: 400 });
  }

  if (loginMethod === "google" && !email) {
    return NextResponse.json({ error: "Email is required for Google users" }, { status: 400 });
  }

  const duplicateClauses: DuplicateClause[] = [];
  if (loginId) duplicateClauses.push({ loginId });
  if (email) duplicateClauses.push({ email });

  if (duplicateClauses.length > 0) {
    const existing = await User.findOne({ $or: duplicateClauses });
    if (existing) {
      return NextResponse.json({ error: "A user with this login ID or email already exists" }, { status: 409 });
    }
  }

  const user = new User({
    name,
    email: email || undefined,
    loginId: loginId || undefined,
    googleId: null,
    password: loginMethod === "password" ? password : undefined,
    status: "active",
    role: "user",
    loginMethods: [loginMethod],
    googleStatus: loginMethod === "google" ? "approved" : "none",
    googleApprovedAt: loginMethod === "google" ? new Date() : null,
    emailVerified: null,
  });

  await user.save();

  return NextResponse.json(serializeUser(user), { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard.response) return guard.response;

  await connectDB();

  const id = new URL(req.url).searchParams.get("id");
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Valid id is required" }, { status: 400 });

  const user = await User.findById(id);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.role === "admin") {
    return NextResponse.json({ error: "The admin account cannot be deleted" }, { status: 400 });
  }

  await Promise.all([
    User.findByIdAndDelete(id),
    AuthSession.deleteMany({ userId: id }),
  ]);

  return NextResponse.json({ deleted: 1 });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard.response) return guard.response;

  await connectDB();

  const id = new URL(req.url).searchParams.get("id");
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Valid id is required" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const user = await User.findById(id);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const nextStatus = typeof body?.status === "string" && STATUS_VALUES.has(body.status)
    ? body.status as UserStatus
    : null;
  const nextGoogleStatus = typeof body?.googleStatus === "string" && GOOGLE_STATUS_VALUES.has(body.googleStatus)
    ? body.googleStatus as UserGoogleStatus
    : null;

  if (user.role === "admin" && (nextStatus && nextStatus !== "active" || nextGoogleStatus || ["email", "loginId", "password"].some(key => key in (body || {})))) {
    return NextResponse.json({ error: "Use verified Admin Account settings to change this account" }, { status: 400 });
  }
  if ("twoFactorEnabled" in (body || {}) || "recoveryCodeHashes" in (body || {})) {
    return NextResponse.json({ error: "Only the account owner can change two-factor settings after verification" }, { status: 403 });
  }
  if (user.twoFactorEnabled && typeof body?.email === "string" && normalizeLoginIdentifier(body.email) !== user.email) {
    return NextResponse.json({ error: "The owner must verify changes to the second-factor email" }, { status: 403 });
  }

  if (typeof body?.name === "string" && body.name.trim()) {
    user.name = body.name.trim();
  }

  if (typeof body?.loginId === "string") {
    user.loginId = normalizeLoginIdentifier(body.loginId) || undefined;
  }

  if (typeof body?.email === "string" && normalizeLoginIdentifier(body.email) !== (user.email || "")) {
    user.email = normalizeLoginIdentifier(body.email) || undefined;
    user.emailVerified = null;
  }

  if (typeof body?.password === "string" && body.password.trim()) {
    if (body.password.length < 12 || Buffer.byteLength(body.password) > 72) return NextResponse.json({ error: "Passwords require at least 12 characters and at most 72 UTF-8 bytes" }, { status: 400 });
    user.password = body.password;
    if (!user.loginMethods.includes("password")) user.loginMethods.push("password");
  }

  if (nextStatus) {
    user.status = nextStatus;
    if (nextStatus === "active" && user.loginMethods.includes("google") && user.googleStatus === "approved") {
      user.googleApprovedAt = new Date();
    }
  }

  if (nextGoogleStatus) {
    user.googleStatus = nextGoogleStatus;
    if (nextGoogleStatus === "approved") {
      if (!user.loginMethods.includes("google")) user.loginMethods.push("google");
      user.status = "active";
      user.googleApprovedAt = new Date();
    } else if (nextGoogleStatus === "pending") {
      if (!user.loginMethods.includes("google")) user.loginMethods.push("google");
      user.googleRequestedAt = new Date();
      if (!user.loginMethods.includes("password")) user.status = "pending";
    } else if (nextGoogleStatus === "rejected") {
      user.googleApprovedAt = null;
      if (!user.loginMethods.includes("password")) user.status = "rejected";
    } else if (nextGoogleStatus === "none") {
      user.googleApprovedAt = null;
    }
  }

  const securityChanged = user.isModified("password") || user.isModified("email") || user.isModified("loginId") || user.isModified("status") || user.isModified("googleStatus");
  if (securityChanged) user.$inc("securityVersion", 1);
  await user.save();

  if (securityChanged || nextStatus === "disabled" || nextStatus === "rejected") {
    await AuthSession.deleteMany({ userId: id });
  } else if (nextGoogleStatus === "rejected" || nextGoogleStatus === "none") {
    await AuthSession.deleteMany({ userId: id, provider: "google" });
  }

  return NextResponse.json(serializeUser(user));
}
