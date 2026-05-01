import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import AppSession from "@/models/AppSession";

// PATCH /api/sessions — called client-side after login to attach UA + IP to the session record
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const currentToken = (session as typeof session & { sessionToken?: string }).sessionToken;
  if (!currentToken) return NextResponse.json({ ok: true });

  const userAgent = req.headers.get("user-agent") || "";
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "";

  await AppSession.findOneAndUpdate({ sessionToken: currentToken }, { userAgent, ip });

  return NextResponse.json({ ok: true });
}

// GET /api/sessions — list all active sessions
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  // Delete expired sessions first (TTL index handles this in the background,
  // but this ensures the list is always clean on page load)
  await AppSession.deleteMany({ expires: { $lt: new Date() } });

  const sessions = await AppSession.find({})
    .sort({ createdAt: -1 })
    .lean();

  // Get current session token to mark "this session" in the UI
  const currentToken = (session as typeof session & { sessionToken?: string }).sessionToken;

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: String(s._id),
      userEmail: s.userEmail,
      userName: s.userName,
      provider: s.provider,
      userAgent: s.userAgent || "",
      ip: s.ip || "",
      expires: s.expires,
      createdAt: s.createdAt,
      isCurrent: s.sessionToken === currentToken,
    })),
  });
}

// DELETE /api/sessions — revoke one or all sessions
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const revokeAll = searchParams.get("all") === "1";

  if (revokeAll) {
    // Revoke all sessions except the current one
    const currentToken = (session as typeof session & { sessionToken?: string }).sessionToken;
    const result = await AppSession.deleteMany(
      currentToken ? { sessionToken: { $ne: currentToken } } : {}
    );
    return NextResponse.json({ deleted: result.deletedCount });
  }

  if (id) {
    await AppSession.findByIdAndDelete(id);
    return NextResponse.json({ deleted: 1 });
  }

  return NextResponse.json({ error: "Provide id or all=1" }, { status: 400 });
}
