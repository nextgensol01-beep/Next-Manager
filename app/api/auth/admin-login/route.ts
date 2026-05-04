import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import {
  getAdminEmail,
  getAdminName,
  hasAdminPasswordConfig,
  verifyAdminPassword,
} from "@/lib/adminAuth";
import {
  getSessionExpires,
  SESSION_COOKIE_NAME,
  USE_SECURE_AUTH_COOKIES,
} from "@/lib/authSessionConfig";
import {
  getRequestIp,
  isActiveUser,
  normalizeLoginIdentifier,
} from "@/lib/authUsers";
import User from "@/models/User";
import AuthSession from "@/models/AuthSession";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const identifier = typeof body?.email === "string" ? normalizeLoginIdentifier(body.email) : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const adminEmail = getAdminEmail();

  if (!identifier || !password) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  await connectDB();

  let user = null;

  if (adminEmail && hasAdminPasswordConfig() && identifier === adminEmail && (await verifyAdminPassword(password))) {
    user = await User.findOneAndUpdate(
      { email: adminEmail },
      {
        $set: {
          name: getAdminName(),
          email: adminEmail,
          loginId: adminEmail,
          emailVerified: new Date(),
          status: "active",
          role: "admin",
        },
        $addToSet: { loginMethods: "password" },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );
  } else {
    user = await User.findOne({
      $or: [
        { loginId: identifier },
        { email: identifier },
      ],
    });

    const canUsePasswordLogin = Array.isArray(user?.loginMethods) && user.loginMethods.includes("password");

    if (!user || !canUsePasswordLogin || !(await user.comparePassword(password))) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
  }

  if (!isActiveUser(user)) {
    return NextResponse.json({ error: "This user is not active. Contact the admin." }, { status: 403 });
  }

  const sessionToken = randomUUID();
  const expires = getSessionExpires();
  const userAgent = req.headers.get("user-agent") || "";
  const ip = getRequestIp(req.headers);
  await AuthSession.deleteMany({ userId: user._id.toString(), expires: { $lte: new Date() } });
  await AuthSession.create({
    sessionToken,
    userId: user._id.toString(),
    provider: "credentials",
    userAgent,
    ip,
    expires,
  });
  await User.findByIdAndUpdate(user._id, {
    $set: {
      lastLoginAt: new Date(),
      lastLoginProvider: "credentials",
      lastLoginIp: ip,
      lastLoginUserAgent: userAgent,
    },
  });

  const response = NextResponse.json({
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
    },
  });

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: sessionToken,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: USE_SECURE_AUTH_COOKIES,
    expires,
  });

  return response;
}
