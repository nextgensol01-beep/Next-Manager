import { NextRequest, NextResponse } from "next/server";
import { AccountSecurityError, cookieOptions, createVerifiedSession, issueChallenge, passwordAccount, PREAUTH_COOKIE, requireSameOrigin, takeSecurityLimit } from "@/lib/server/account-security";
import { newOpaqueToken } from "@/lib/server/account-security-crypto";
import { notifySecurity, requestMetadata } from "@/lib/server/account-security-mail";
import { normalizeLoginIdentifier } from "@/lib/authUsers";

export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req);
    const body = await req.json().catch(() => null);
    const identifier = typeof body?.email === "string" ? normalizeLoginIdentifier(body.email).slice(0, 254) : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const metadata = requestMetadata(req.headers);
    const [ip, account] = await Promise.all([
      takeSecurityLimit(`login-ip:${metadata.ip}`, 30, 15 * 60_000),
      takeSecurityLimit(`login-account:${identifier}`, 10, 15 * 60_000),
    ]);
    if (!ip.allowed || !account.allowed) throw new AccountSecurityError("Too many login attempts. Try again later.", 429);
    const user = identifier && password && password.length <= 256 ? await passwordAccount(identifier, password) : null;
    if (!user) {
      notifySecurity({ event: "Failed email/password login", status: "Failed", email: identifier, verified: false, metadata });
      return NextResponse.json({ error: "Invalid email or password, or account unavailable" }, { status: 401 });
    }
    if (user.twoFactorEnabled) {
      const token = newOpaqueToken();
      const challenge = await issueChallenge({ userId: String(user._id), binding: token, action: "login", provider: "credentials" });
      const response = NextResponse.json({ secondFactor: true, ...challenge });
      response.cookies.set(PREAUTH_COOKIE, `${token}.${challenge.challengeId}`, { ...cookieOptions, maxAge: 300 });
      return response;
    }
    return await createVerifiedSession(String(user._id), "credentials", req.headers, user.securityVersion || 0);
  } catch (error) {
    return NextResponse.json({ error: error instanceof AccountSecurityError ? error.message : "Sign in is temporarily unavailable" }, { status: error instanceof AccountSecurityError ? error.status : 503 });
  }
}
