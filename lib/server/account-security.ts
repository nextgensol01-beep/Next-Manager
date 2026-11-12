import "server-only";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { getAdminEmail, getAdminName, hasAdminPasswordConfig, verifyAdminPassword } from "@/lib/adminAuth";
import { isActiveUser, normalizeLoginIdentifier } from "@/lib/authUsers";
import { getSessionExpires, readSessionTokenFromCookieStore, SESSION_COOKIE_NAME, USE_SECURE_AUTH_COOKIES } from "@/lib/authSessionConfig";
import User from "@/models/User";
import AuthSession from "@/models/AuthSession";
import { AccountSecurityConfig, KnownAuthDevice, SecurityChallenge, SecurityGate } from "@/models/AccountSecurity";
import { matchesSecret, newOpaqueToken, newOtp, newRecoveryCodes, OTP_ATTEMPTS, OTP_COOLDOWN_MS, OTP_TTL_MS, recoveryDigest, securityDigest, validEmail } from "./account-security-crypto";
import { notifySecurity, requestMetadata, securityEmail, sendAccountMail } from "./account-security-mail";
import { renderVerificationEmail, type VerificationEmailPurpose } from "@/lib/email-verification-template";

export class AccountSecurityError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const PREAUTH_COOKIE = `${USE_SECURE_AUTH_COOKIES ? "__Secure-" : ""}nextgen-preauth`;
export const DEVICE_COOKIE = `${USE_SECURE_AUTH_COOKIES ? "__Secure-" : ""}nextgen-device`;
export const cookieOptions = { httpOnly: true, secure: USE_SECURE_AUTH_COOKIES, sameSite: "lax" as const, path: "/" };

export function requireSameOrigin(req: Request) {
  const expected = process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).origin : new URL(req.url).origin;
  if (req.headers.get("origin") !== expected) throw new AccountSecurityError("Invalid request origin", 403);
}
export async function takeSecurityLimit(key: string, limit: number, windowMs: number) {
  await connectDB();
  const window = Math.floor(Date.now() / windowMs);
  const id = securityDigest(`limit:${key}:${window}`);
  let entry;
  try {
    entry = await SecurityGate.findOneAndUpdate({ _id: id }, { $inc: { count: 1 }, $setOnInsert: { expires: new Date((window + 2) * windowMs) } }, { upsert: true, new: true });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    entry = await SecurityGate.findOneAndUpdate({ _id: id }, { $inc: { count: 1 } }, { new: true });
  }
  return { allowed: Boolean(entry && entry.count <= limit), count: entry?.count || 0 };
}
async function enforceLimit(key: string, limit: number, windowMs: number) {
  if (!(await takeSecurityLimit(key, limit, windowMs)).allowed) throw new AccountSecurityError("Too many attempts. Please try again later.", 429);
}
async function cooldown(userId: string) {
  const id = securityDigest(`otp-cooldown:${userId}`);
  try {
    await SecurityGate.findOneAndUpdate({ _id: id, expires: { $lte: new Date() } }, { $set: { count: 1, expires: new Date(Date.now() + OTP_COOLDOWN_MS) } }, { upsert: true, new: true });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new AccountSecurityError("Wait 60 seconds before requesting another code.", 429);
    throw error;
  }
}

// Bootstrap only after proving the legacy environment password. Never reactivate an account.
export async function passwordAccount(identifier: string, password: string) {
  await connectDB();
  const config = await AccountSecurityConfig.findById("primary");
  let user = await User.findOne({ $or: [{ loginId: identifier }, { email: identifier }] });
  // An existing env-admin session can enable 2FA before its first password login.
  // Pinning that same account must not strand its still-unmigrated credentials.
  const pinnedLegacyAdmin = user && user.role === "admin" && isActiveUser(user)
    && String(config?.adminUserId || "") === String(user._id)
    && !user.credentialsManaged && !user.password && user.loginMethods?.includes("password");
  if (identifier === getAdminEmail() && pinnedLegacyAdmin && hasAdminPasswordConfig() && await verifyAdminPassword(password)) {
    const migrated = await User.findOneAndUpdate({
      _id: user._id, role: "admin", status: { $in: ["active", null] },
      credentialsManaged: { $ne: true }, password: { $in: [null, ""] }, loginMethods: "password",
    }, { $set: { password: await bcrypt.hash(password, 12), credentialsManaged: true } }, { new: true, runValidators: true });
    if (migrated) return migrated;
    // A concurrent credential/status change wins; never overwrite it with the env password.
    user = await User.findById(user._id);
  }
  if (identifier === getAdminEmail() && !config?.adminUserId && !user?.credentialsManaged && hasAdminPasswordConfig() && await verifyAdminPassword(password)) {
    if (user && !isActiveUser(user)) return null;
    if (!user) user = new User({ name: getAdminName(), email: identifier, loginId: identifier, status: "active" });
    user.role = "admin";
    user.password = password;
    user.credentialsManaged = true;
    if (!user.loginMethods.includes("password")) user.loginMethods.push("password");
    await user.save();
    await AccountSecurityConfig.findOneAndUpdate({ _id: "primary" }, { $setOnInsert: { adminUserId: String(user._id) } }, { upsert: true });
    return user;
  }
  if (!user || !isActiveUser(user) || !user.loginMethods?.includes("password") || password.length > 256 || !await user.comparePassword(password)) return null;
  return user;
}

export async function createVerifiedSession(userId: string, provider: "credentials" | "google", headers: Headers, expectedVersion?: number, recovered = false) {
  await connectDB();
  const user = await User.findById(userId);
  if (!user || !isActiveUser(user) || (provider === "google" && user.googleStatus !== "approved") || (expectedVersion !== undefined && (user.securityVersion || 0) !== expectedVersion)) throw new AccountSecurityError("Account authorization changed. Sign in again.", 403);
  const store = await cookies();
  const metadata = requestMetadata(headers);
  const sessionToken = newOpaqueToken();
  const expires = getSessionExpires();
  await AuthSession.create({ sessionToken, userId, provider, ...metadata, expires, securityVersion: user.securityVersion || 0, lastActivityAt: new Date(), ...(recovered ? { recoveryVerifiedAt: new Date() } : {}) });
  await recordVerifiedLogin(user, provider, headers);
  const response = NextResponse.json({ user: { id: userId, name: user.name, email: user.email } });
  response.cookies.set(SESSION_COOKIE_NAME, sessionToken, { ...cookieOptions, expires });
  response.cookies.set(PREAUTH_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  // Read above to ensure cookie access is in the request context before returning.
  void store;
  return response;
}

// Shared by password sessions and NextAuth's Google database adapter.
export async function recordVerifiedLogin(user: { _id: unknown; name?: string; email?: string; lastLoginAt?: Date; role?: string }, provider: string, headers: Headers) {
  const metadata = requestMetadata(headers);
  const store = await cookies();
  let deviceToken = store.get(DEVICE_COOKIE)?.value || "";
  if (!/^[a-f0-9]{64}$/.test(deviceToken)) deviceToken = newOpaqueToken();
  store.set(DEVICE_COOKIE, deviceToken, { ...cookieOptions, maxAge: 180 * 86400 });
  const key = securityDigest(`device:${String(user._id)}:${deviceToken}`);
  const prior = await KnownAuthDevice.findById(key);
  const reason = !prior ? "New browser/device cookie" : prior.location && prior.location !== "Unknown" && metadata.location !== "Unknown" && prior.location !== metadata.location ? "Approximate location changed" : "";
  await KnownAuthDevice.findOneAndUpdate({ _id: key }, { $set: { userId: String(user._id), location: metadata.location, expires: new Date(Date.now() + 180 * 86400_000) } }, { upsert: true });
  notifySecurity({ event: `Successful ${user.role === "admin" ? "administrator" : "approved user"} ${provider} login`, status: "Successful", verified: true, name: user.name, email: user.email, metadata });
  if (reason && user.lastLoginAt) notifySecurity({ event: "Suspicious login: new device or location", status: "Successful", verified: true, name: user.name, email: user.email, metadata, reason });
  await User.findByIdAndUpdate(user._id, { $set: { lastLoginAt: new Date(), lastLoginProvider: provider, lastLoginIp: metadata.ip, lastLoginUserAgent: metadata.userAgent } });
}

export type SecurityAction = "email" | "password" | "recovery_email" | "twofactor_on" | "twofactor_off" | "factor_email" | "recovery_codes" | "login";
const ADMIN_ACTIONS = new Set(["email", "password", "recovery_email"]);
const ADMIN_FACTOR_ACTIONS = new Set(["twofactor_on", "twofactor_off", "recovery_codes", "login"]);

const OTP_PURPOSES: Record<SecurityAction, { current?: VerificationEmailPurpose; replacement?: VerificationEmailPurpose }> = {
  email: { current: "account-email-change", replacement: "account-email-verify" },
  password: { current: "account-password-change" },
  recovery_email: { current: "account-recovery-gmail-change", replacement: "account-recovery-gmail-verify" },
  twofactor_on: { current: "account-two-factor-enable" },
  twofactor_off: { current: "account-two-factor-disable" },
  factor_email: { replacement: "account-email-recovery" },
  recovery_codes: { current: "account-recovery-codes-replace" },
  login: { current: "account-login" },
};

function sendAccountOtp(to: string, code: string, purpose: VerificationEmailPurpose) {
  return sendAccountMail(to, renderVerificationEmail({
    verificationCode: code,
    expiryMinutes: Math.ceil(OTP_TTL_MS / 60_000),
    purpose,
    subjectPrefix: "NextGen security: ",
  }));
}

export async function issueChallenge(input: { userId: string; binding: string; action: SecurityAction; targetEmail?: string; password?: string; provider?: string; recoveryCode?: string }) {
  await connectDB();
  const user = await User.findById(input.userId);
  if (!user || !isActiveUser(user)) throw new AccountSecurityError("Account unavailable", 403);
  if (ADMIN_ACTIONS.has(input.action) && user.role !== "admin") throw new AccountSecurityError("Admin access required", 403);
  if (input.action === "login" && !user.twoFactorEnabled) throw new AccountSecurityError("Sign in again", 401);
  if (input.action === "twofactor_on" && user.twoFactorEnabled || input.action === "twofactor_off" && !user.twoFactorEnabled) throw new AccountSecurityError("Security setting already changed. Refresh this page.");
  await enforceLimit(`otp-send:${input.userId}`, 6, 15 * 60_000);
  await cooldown(input.userId);
  let primary = user.emailVerified && validEmail(user.email || "") ? user.email : "";
  let targetEmail = normalizeLoginIdentifier(input.targetEmail || "");
  if (input.action === "twofactor_on" && user.role !== "admin") {
    // First enrollment proves ownership of the account's email, including legacy local accounts.
    primary = user.email || targetEmail;
    if (!validEmail(primary)) throw new AccountSecurityError("Add a valid email to enroll two-factor authentication.");
    targetEmail = primary;
  }
  // The administrator's email-shaped login ID need not be a real mailbox.
  // Its separately configured security Gmail is the actual email factor, including at login.
  if (user.role === "admin") {
    if (input.action === "factor_email") throw new AccountSecurityError("Use verified recovery Gmail settings for the admin account.");
    primary = await securityEmail();
    if (ADMIN_FACTOR_ACTIONS.has(input.action)) targetEmail = primary;
  }
  if (["email", "recovery_email", "factor_email"].includes(input.action)) {
    if (!validEmail(targetEmail)) throw new AccountSecurityError("A valid new email is required.");
    if (input.action === "recovery_email" && !/@(gmail\.com|googlemail\.com)$/.test(targetEmail)) throw new AccountSecurityError("Use a Gmail address for security recovery.");
    if (input.action === "email" && await User.exists({ _id: { $ne: user._id }, $or: [{ email: targetEmail }, { loginId: targetEmail }] })) throw new AccountSecurityError("That login email is already in use.", 409);
    if (input.action === "email" && !user.password) throw new AccountSecurityError("Set a password before changing the login email to preserve account access.");
  }
  if (!validEmail(primary)) throw new AccountSecurityError("A security email is not configured or verified. Configure AUTH_SECURITY_EMAIL or connect Gmail.", 409);
  let passwordHash = "";
  if (input.action === "password") {
    if (!input.password || input.password.length < 12 || Buffer.byteLength(input.password) > 72) throw new AccountSecurityError("Use a password of at least 12 characters and at most 72 UTF-8 bytes.");
    passwordHash = await bcrypt.hash(input.password, 12);
  }
  const id = newOpaqueToken();
  const code = newOtp();
  const dual = ["email", "recovery_email", "factor_email", "twofactor_on", "twofactor_off", "recovery_codes"].includes(input.action) && Boolean(targetEmail) && targetEmail !== primary;
  const newCode = dual ? newOtp() : "";
  // Mailbox recovery requires primary authentication/session plus a one-use recovery code,
  // then verification of the replacement mailbox. It cannot alter the admin recovery Gmail.
  if (input.action === "factor_email") {
    if (!user.twoFactorEnabled) throw new AccountSecurityError("Enable two-factor authentication first.");
    const recentlyRecovered = await AuthSession.findOneAndUpdate({ sessionToken: input.binding, userId: String(user._id), recoveryVerifiedAt: { $gt: new Date(Date.now() - OTP_TTL_MS) } }, { $unset: { recoveryVerifiedAt: 1 } });
    if (!recentlyRecovered) {
      if (!input.recoveryCode) throw new AccountSecurityError("A saved recovery code is required.");
      const used = await User.findOneAndUpdate({ _id: user._id, recoveryCodeHashes: recoveryDigest(input.recoveryCode) }, { $pull: { recoveryCodeHashes: recoveryDigest(input.recoveryCode) } });
      if (!used) throw new AccountSecurityError("Invalid or already used recovery code.");
    }
  }
  await SecurityChallenge.create({ _id: id, userId: input.userId, binding: securityDigest(input.binding), action: input.action, codeHash: securityDigest(`${id}:${code}`), newCodeHash: dual ? securityDigest(`${id}:${newCode}`) : "", targetEmail, passwordHash, securityVersion: user.securityVersion || 0, provider: input.provider, expires: new Date(Date.now() + OTP_TTL_MS) });
  try {
    const { current, replacement } = OTP_PURPOSES[input.action];
    if (current) await sendAccountOtp(primary, code, current);
    if (dual || input.action === "factor_email") {
      await sendAccountOtp(targetEmail, dual ? newCode : code, replacement ?? "account-email-verify");
    }
  } catch {
    if (input.action === "login") return { challengeId: id, dual: false, expiresIn: 300, resendAfter: 60, deliveryUnavailable: true };
    await SecurityChallenge.deleteOne({ _id: id });
    throw new AccountSecurityError("Verification email could not be delivered. Your account has not changed. Try again after 60 seconds.", 503);
  }
  await SecurityChallenge.deleteMany({ userId: input.userId, binding: securityDigest(input.binding), action: input.action, _id: { $ne: id } });
  return { challengeId: id, dual, expiresIn: 300, resendAfter: 60, recovery: input.action === "factor_email" };
}

export async function verifyChallenge(input: { id: string; binding: string; code: string; newCode?: string; recoveryCode?: string; userId?: string; loginOnly?: boolean }) {
  await connectDB();
  if (!/^[a-f0-9]{64}$/.test(input.id)) throw new AccountSecurityError("Invalid verification request.");
  const challenge = await SecurityChallenge.findOneAndUpdate({ _id: input.id, binding: securityDigest(input.binding), ...(input.userId ? { userId: input.userId } : {}), ...(input.loginOnly ? { action: "login" } : { action: { $ne: "login" } }), consumed: false, expires: { $gt: new Date() }, attempts: { $lt: OTP_ATTEMPTS } }, { $inc: { attempts: 1 } }, { new: true }).select("+passwordHash");
  if (!challenge) throw new AccountSecurityError("Code expired, already used, or too many attempts. Request a new code.");
  const user = await User.findById(challenge.userId);
  if (!user || !isActiveUser(user) || (user.securityVersion || 0) !== challenge.securityVersion) throw new AccountSecurityError("Account security changed. Start again.", 403);
  if (user.role === "admin" && ADMIN_FACTOR_ACTIONS.has(challenge.action) && (challenge.targetEmail !== await securityEmail() || challenge.newCodeHash)) {
    throw new AccountSecurityError("Verification delivery has changed. Cancel and request a new code.");
  }
  let valid = matchesSecret(challenge.codeHash, `${input.id}:${input.code}`) && (!challenge.newCodeHash || matchesSecret(challenge.newCodeHash, `${input.id}:${input.newCode || ""}`));
  if (challenge.action === "factor_email") valid = matchesSecret(challenge.newCodeHash || challenge.codeHash, `${input.id}:${challenge.newCodeHash ? input.newCode || "" : input.code}`);
  if (challenge.action === "login" && input.recoveryCode) {
    const hash = recoveryDigest(input.recoveryCode);
    const recovered = await User.findOneAndUpdate({ _id: user._id, recoveryCodeHashes: hash, ...(user.securityVersion ? { securityVersion: user.securityVersion } : { $or: [{ securityVersion: 0 }, { securityVersion: { $exists: false } }] }) }, { $pull: { recoveryCodeHashes: hash } });
    valid = Boolean(recovered);
  }
  if (!valid) throw new AccountSecurityError(`Incorrect code. ${OTP_ATTEMPTS - challenge.attempts} attempts remaining.`);
  const claimed = await SecurityChallenge.findOneAndUpdate({ _id: input.id, consumed: false }, { $set: { consumed: true } });
  if (!claimed) throw new AccountSecurityError("Code has already been used.");
  return { challenge, user };
}

export async function applySecurityChange(input: Parameters<typeof verifyChallenge>[0], headers: Headers, currentToken: string) {
  const { challenge, user } = await verifyChallenge(input);
  const previousSecurityEmail = user.role === "admin" ? await securityEmail() : "";
  const set: Record<string, unknown> = {};
  let codes: string[] | undefined;
  switch (challenge.action) {
    case "password": set.password = challenge.passwordHash; set.credentialsManaged = true; break;
    case "email": set.email = challenge.targetEmail; set.loginId = challenge.targetEmail; set.emailVerified = new Date(); set.credentialsManaged = true; break;
    case "twofactor_on":
      set.twoFactorEnabled = true;
      if (user.role !== "admin") {
        set.emailVerified = new Date();
        if (!user.email) set.email = challenge.targetEmail;
      }
      codes = newRecoveryCodes(); set.recoveryCodeHashes = codes.map(recoveryDigest); break;
    case "twofactor_off": set.twoFactorEnabled = false; set.recoveryCodeHashes = []; break;
    case "recovery_codes": codes = newRecoveryCodes(); set.recoveryCodeHashes = codes.map(recoveryDigest); break;
    case "factor_email":
      if (user.role === "admin") throw new AccountSecurityError("Use the verified admin email change flow for this account.");
      set.email = challenge.targetEmail; set.emailVerified = new Date(); break;
    case "recovery_email": break;
    default: throw new AccountSecurityError("Unsupported security change");
  }
  // Legacy documents have no version field; treat them as version zero.
  const versionFilter = challenge.securityVersion === 0 ? { $or: [{ securityVersion: 0 }, { securityVersion: { $exists: false } }] } : { securityVersion: challenge.securityVersion };
  const updated = await User.findOneAndUpdate({ _id: user._id, ...versionFilter }, { $set: set, $inc: { securityVersion: 1 }, ...(challenge.action === "password" ? { $addToSet: { loginMethods: "password" } } : {}) }, { new: true, runValidators: true });
  if (!updated) throw new AccountSecurityError("Account changed during verification. Start again.", 409);
  if (user.role === "admin") await AccountSecurityConfig.findOneAndUpdate({ _id: "primary" }, { $setOnInsert: { adminUserId: String(user._id) }, $set: { recoveryEmail: previousSecurityEmail, recoveryVerifiedAt: new Date() } }, { upsert: true });
  if (challenge.action === "recovery_email") await AccountSecurityConfig.findOneAndUpdate({ _id: "primary" }, { $set: { recoveryEmail: challenge.targetEmail, recoveryVerifiedAt: new Date() } }, { upsert: true });
  // The version is enforced on every API request, including races with session creation.
  await AuthSession.updateOne({ sessionToken: currentToken, userId: String(user._id) }, { $set: { securityVersion: updated.securityVersion } });
  await AuthSession.deleteMany({ userId: String(user._id), sessionToken: { $ne: currentToken } });
  await SecurityChallenge.deleteMany({ userId: String(user._id) });
  const confirmationTo = user.role === "admin"
    ? [previousSecurityEmail, ...(["email", "recovery_email"].includes(challenge.action) ? [challenge.targetEmail] : [])]
    : [user.email, updated.email];
  notifySecurity({ event: `Account ${challenge.action.replaceAll("_", " ")} changed`, status: "Successful", verified: true, email: updated.email, name: user.name, metadata: requestMetadata(headers) }, confirmationTo.filter(Boolean));
  return { success: true, recoveryCodes: codes };
}

export async function sessionBinding() {
  return readSessionTokenFromCookieStore(await cookies());
}
