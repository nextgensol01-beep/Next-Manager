import bcrypt from "bcryptjs";

function allowsPlainAdminPassword() {
  return process.env.NODE_ENV !== "production";
}

export function getAdminEmail() {
  return process.env.ADMIN_EMAIL?.trim().toLowerCase() || "";
}

export function getAdminName() {
  return process.env.ADMIN_NAME?.trim() || "Admin";
}

export function hasAdminPasswordConfig() {
  return Boolean(process.env.ADMIN_PASSWORD_HASH || (allowsPlainAdminPassword() && process.env.ADMIN_PASSWORD));
}

export async function verifyAdminPassword(candidate: string): Promise<boolean> {
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
  if (adminPasswordHash) {
    return bcrypt.compare(candidate, adminPasswordHash);
  }

  if (!allowsPlainAdminPassword()) return false;

  const adminPassword = process.env.ADMIN_PASSWORD;
  return Boolean(adminPassword && candidate === adminPassword);
}
