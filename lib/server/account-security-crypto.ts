import "server-only";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const OTP_TTL_MS = 5 * 60_000;
export const OTP_ATTEMPTS = 5;
export const OTP_COOLDOWN_MS = 60_000;
export function securityDigest(value: string) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Account security secret is not configured");
  return createHmac("sha256", secret).update(`account-security:v1:${value}`).digest("hex");
}
export function newOtp() { return randomInt(0, 1_000_000).toString().padStart(6, "0"); }
export function newOpaqueToken() { return randomBytes(32).toString("hex"); }
export function matchesSecret(hash: string, value: string) {
  const actual = Buffer.from(securityDigest(value));
  const expected = Buffer.from(hash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function newRecoveryCodes() {
  return Array.from({ length: 10 }, () => randomBytes(10).toString("hex"));
}
export function recoveryDigest(code: string) {
  return securityDigest(`recovery:${code.replace(/[\s-]/g, "").toLowerCase()}`);
}
export function validEmail(email: string) {
  return email.length <= 254 && /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(email);
}
