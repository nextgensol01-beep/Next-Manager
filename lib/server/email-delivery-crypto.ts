import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
export class DeliverySecurityError extends Error {
  constructor(
    message: string,
    public status = 403,
    public code = "DELIVERY_SECURITY",
    public attemptsRemaining?: number,
  ) {
    super(message);
  }
}
export function securitySecret(
  name: "EMAIL_DELIVERY_OTP_SECRET" | "EMAIL_SEND_PIN_PEPPER",
) {
  const value = process.env[name];
  if (!value || Buffer.byteLength(value) < 32)
    throw new DeliverySecurityError(
      `Configure ${name} with a strong random server secret of at least 32 bytes.`,
      503,
      "SECURITY_CONFIGURATION_REQUIRED",
    );
  return value;
}
export const generateDeliveryOtp = () =>
  String(randomInt(0, 1_000_000)).padStart(6, "0");
export const hashDeliveryOtp = (id: string, code: string) =>
  createHmac("sha256", securitySecret("EMAIL_DELIVERY_OTP_SECRET"))
    .update(`${id}:${code}`)
    .digest("hex");
export function matchesDeliveryOtp(id: string, code: string, hash?: string) {
  const candidate = Buffer.from(hashDeliveryOtp(id, code), "hex"),
    stored = Buffer.from(hash || "", "hex");
  return (
    stored.length === candidate.length && timingSafeEqual(candidate, stored)
  );
}
function pinMaterial(pin: string) {
  return createHmac("sha256", securitySecret("EMAIL_SEND_PIN_PEPPER"))
    .update(pin)
    .digest("hex");
}
export const hashSendPin = (pin: string) => bcrypt.hash(pinMaterial(pin), 12);
export const matchesSendPin = (pin: string, hash: string) =>
  bcrypt.compare(pinMaterial(pin), hash);
