import { NextRequest, NextResponse } from "next/server";
import { AccountSecurityError, cookieOptions, createVerifiedSession, issueChallenge, PREAUTH_COOKIE, requireSameOrigin, takeSecurityLimit, verifyChallenge } from "@/lib/server/account-security";
import { securityDigest } from "@/lib/server/account-security-crypto";
import { SecurityChallenge } from "@/models/AccountSecurity";
import { connectDB } from "@/lib/mongoose";
import { notifySecurity, requestMetadata } from "@/lib/server/account-security-mail";

export async function GET(req: NextRequest) {
  const [binding, id] = (req.cookies.get(PREAUTH_COOKIE)?.value || "").split(".");
  if (!binding || !id) return NextResponse.json({ required: false }, { headers: { "Cache-Control": "no-store" } });
  await connectDB();
  const challenge = await SecurityChallenge.findOne({ _id: id, binding: securityDigest(binding), action: "login", consumed: false, expires: { $gt: new Date() } });
  return NextResponse.json({ required: Boolean(challenge), challengeId: challenge ? id : undefined }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req);
    const metadata = requestMetadata(req.headers);
    if (!(await takeSecurityLimit(`factor-ip:${metadata.ip}`, 30, 15 * 60_000)).allowed) throw new AccountSecurityError("Too many attempts. Try again later.", 429);
    const [binding, id] = (req.cookies.get(PREAUTH_COOKIE)?.value || "").split(".");
    if (!binding || !id) throw new AccountSecurityError("Sign in again to request a code.", 401);
    const body = await req.json().catch(() => null);
    if (body?.resend === true) {
      await connectDB();
      const prior = await SecurityChallenge.findOne({ _id: id, binding: securityDigest(binding), action: "login", consumed: false, expires: { $gt: new Date() } });
      if (!prior) throw new AccountSecurityError("Sign in again to request a code.", 401);
      const challenge = await issueChallenge({ userId: prior.userId, action: "login", binding, provider: prior.provider });
      await SecurityChallenge.deleteOne({ _id: id });
      const response = NextResponse.json({ secondFactor: true, ...challenge });
      response.cookies.set(PREAUTH_COOKIE, `${binding}.${challenge.challengeId}`, { ...cookieOptions, maxAge: 300 });
      return response;
    }
    const { challenge, user } = await verifyChallenge({ id, binding, code: typeof body?.code === "string" ? body.code : "", recoveryCode: typeof body?.recoveryCode === "string" ? body.recoveryCode : "", loginOnly: true });
    if (body?.recoveryCode) notifySecurity({ event: "Recovery code used for login", status: "Successful", verified: true, email: user.email, name: user.name, metadata }, user.role === "admin" ? [] : [user.email]);
    return await createVerifiedSession(String(user._id), challenge.provider === "google" ? "google" : "credentials", req.headers, challenge.securityVersion, Boolean(body?.recoveryCode));
  } catch (error) {
    notifySecurity({ event: "Second-factor verification failed", status: "Failed", verified: false, metadata: requestMetadata(req.headers) });
    return NextResponse.json({ error: error instanceof AccountSecurityError ? error.message : "Verification temporarily unavailable" }, { status: error instanceof AccountSecurityError ? error.status : 503 });
  }
}
