import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";
import AuthSession from "@/models/AuthSession";
import { AccountSecurityError, applySecurityChange, issueChallenge, requireSameOrigin, sessionBinding, takeSecurityLimit, type SecurityAction } from "@/lib/server/account-security";
import { securityEmail } from "@/lib/server/account-security-mail";
import { readSessionTokenFromCookieStore } from "@/lib/authSessionConfig";

async function currentUser() {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) throw new AccountSecurityError("Unauthorized", 401);
  await connectDB();
  const user = await User.findById(id);
  if (!user) throw new AccountSecurityError("Unauthorized", 401);
  return user;
}
function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof AccountSecurityError ? error.message : (error as { code?: number })?.code === 11000 ? "That email is already in use. Start again." : "Security settings are temporarily unavailable" }, { status: error instanceof AccountSecurityError ? error.status : 503 });
}
export async function GET() {
  try {
    const user = await currentUser();
    const recentRecovery = await AuthSession.exists({ sessionToken: await sessionBinding(), userId: String(user._id), recoveryVerifiedAt: { $gt: new Date(Date.now() - 5 * 60_000) } });
    const recoveryEmail = user.role === "admin" ? await securityEmail() : undefined;
    return NextResponse.json({ email: user.email || "", loginId: user.loginId || user.email || "", otpEmail: recoveryEmail || user.email || "", emailVerified: Boolean(user.emailVerified), twoFactorEnabled: Boolean(user.twoFactorEnabled), recentRecovery: Boolean(recentRecovery), isAdmin: user.role === "admin", recoveryEmail }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req);
    const user = await currentUser();
    if (!(await takeSecurityLimit(`settings-verify:${String(user._id)}`, 30, 15 * 60_000)).allowed) throw new AccountSecurityError("Too many attempts. Try again later.", 429);
    const body = await req.json().catch(() => null);
    const binding = await sessionBinding();
    if (!binding) throw new AccountSecurityError("Sign in again.", 401);
    if (body?.verify === true) {
      const result = await applySecurityChange({ id: String(body.challengeId || ""), userId: String(user._id), binding, code: String(body.code || ""), newCode: String(body.newCode || "") }, req.headers, readSessionTokenFromCookieStore(req.cookies));
      return NextResponse.json(result);
    }
    const actions: SecurityAction[] = ["email", "password", "recovery_email", "twofactor_on", "twofactor_off", "factor_email", "recovery_codes"];
    if (!actions.includes(body?.action)) throw new AccountSecurityError("Unsupported security change");
    if (body.action === "factor_email" && user.role === "admin") throw new AccountSecurityError("Use Change Email for the admin account.");
    if (body.action === "recovery_codes" && !user.twoFactorEnabled) throw new AccountSecurityError("Enable two-factor authentication first.");
    const challenge = await issueChallenge({ userId: String(user._id), binding, action: body.action, targetEmail: typeof body.email === "string" ? body.email : "", password: typeof body.password === "string" ? body.password : "", recoveryCode: typeof body.recoveryCode === "string" ? body.recoveryCode : "" });
    return NextResponse.json(challenge);
  } catch (error) { return failure(error); }
}
