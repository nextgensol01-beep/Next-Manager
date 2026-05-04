import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import { readSessionTokenFromCookieStore } from "@/lib/authSessionConfig";
import { getRequestIp, isAdminSession } from "@/lib/authUsers";
import AuthAccount from "@/models/AuthAccount";
import AuthSession from "@/models/AuthSession";
import User from "@/models/User";

function getSessionUserId(session: Session | null) {
  return (session?.user as (Session["user"] & { id?: string }) | undefined)?.id || "";
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const currentUserId = getSessionUserId(session);
  if (!currentUserId) return NextResponse.json({ error: "User id missing from session" }, { status: 403 });
  const isAdmin = await isAdminSession(session);

  await connectDB();

  const currentSessionToken = readSessionTokenFromCookieStore(req.cookies);
  const sessions = await AuthSession.find({
    expires: { $gt: new Date() },
    ...(isAdmin ? {} : { userId: currentUserId }),
  })
    .sort({ updatedAt: -1 })
    .lean() as unknown as Array<{
      _id: { toString(): string };
      sessionToken: string;
      userId: string;
      provider?: "credentials" | "google";
      userAgent?: string;
      ip?: string;
      expires: Date;
      createdAt: Date;
      updatedAt: Date;
    }>;
  const users = await User.find({
    _id: { $in: sessions.map((entry) => entry.userId).filter(Boolean) },
  }).lean() as unknown as Array<{ _id: { toString(): string }; name?: string; email?: string; loginId?: string }>;
  const userMap = new Map(users.map((user) => [user._id.toString(), user]));
  const googleAccounts = await AuthAccount.find({
    userId: { $in: sessions.map((entry) => entry.userId).filter(Boolean) },
    provider: "google",
  }).select("userId").lean() as unknown as Array<{ userId: string }>;
  const googleUserIds = new Set(googleAccounts.map((account) => String(account.userId)));

  return NextResponse.json(
    sessions.map((entry) => {
      const user = userMap.get(String(entry.userId));
      return {
        id: entry._id.toString(),
        userId: String(entry.userId),
        userName: String(user?.name || ""),
        userEmail: String(user?.email || user?.loginId || ""),
        provider: entry.provider || (googleUserIds.has(String(entry.userId)) ? "google" : "credentials"),
        userAgent: entry.userAgent || "",
        ip: entry.ip || "",
        expires: entry.expires,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        isCurrent: entry.sessionToken === currentSessionToken,
      };
    })
  );
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const currentUserId = getSessionUserId(session);
  if (!currentUserId) return NextResponse.json({ error: "User id missing from session" }, { status: 403 });
  const isAdmin = await isAdminSession(session);

  const url = new URL(req.url);
  const currentSessionToken = readSessionTokenFromCookieStore(req.cookies);
  if (url.searchParams.get("all") === "1") {
    await connectDB();
    const result = await AuthSession.deleteMany({
      sessionToken: { $ne: currentSessionToken },
      ...(isAdmin ? {} : { userId: currentUserId }),
    });
    return NextResponse.json({ success: true, deleted: result.deletedCount || 0 });
  }

  const body = await req.json().catch(() => null);
  const id = url.searchParams.get("id") || (typeof body?.id === "string" ? body.id : "");
  if (!id) {
    return NextResponse.json({ error: "Session id is required" }, { status: 400 });
  }

  await connectDB();
  const target = await AuthSession.findById(id).lean() as unknown as { userId?: string } | null;
  if (!target) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (!isAdmin && String(target.userId) !== currentUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await AuthSession.findByIdAndDelete(id);

  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const currentSessionToken = readSessionTokenFromCookieStore(req.cookies);
  if (!currentSessionToken) {
    return NextResponse.json({ error: "Session token not found" }, { status: 400 });
  }

  await AuthSession.findOneAndUpdate(
    { sessionToken: currentSessionToken },
    {
      $set: {
        userAgent: req.headers.get("user-agent") || "",
        ip: getRequestIp(req.headers),
      },
    },
    { new: true }
  );
  const userId = getSessionUserId(session);
  if (userId) {
    await User.findByIdAndUpdate(userId, {
      $set: {
        lastLoginIp: getRequestIp(req.headers),
        lastLoginUserAgent: req.headers.get("user-agent") || "",
      },
    });
  }

  return NextResponse.json({ success: true });
}
