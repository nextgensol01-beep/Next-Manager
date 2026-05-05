import bcrypt from "bcryptjs";

function allowsPlainAdminPassword() {
  return process.env.NODE_ENV !== "production";
}

function getAdminPasswordHash() {
  return (process.env.ADMIN_PASSWORD_HASH || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replaceAll("\\$", "$");
}

export function getAdminEmail() {
  return process.env.ADMIN_EMAIL?.trim().toLowerCase() || "";
}

export function getAdminName() {
  return process.env.ADMIN_NAME?.trim() || "Admin";
}

export function hasAdminPasswordConfig() {
  return Boolean(getAdminPasswordHash() || (allowsPlainAdminPassword() && process.env.ADMIN_PASSWORD));
}

export async function verifyAdminPassword(candidate: string): Promise<boolean> {
  const adminPasswordHash = getAdminPasswordHash();
  if (adminPasswordHash) {
    return bcrypt.compare(candidate, adminPasswordHash);
  }

  if (!allowsPlainAdminPassword()) return false;

  const adminPassword = process.env.ADMIN_PASSWORD;
  return Boolean(adminPassword && candidate === adminPassword);
}
