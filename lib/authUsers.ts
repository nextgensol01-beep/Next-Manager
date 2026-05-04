import type { Session } from "next-auth";
import { connectDB } from "@/lib/mongoose";
import { getAdminEmail } from "@/lib/adminAuth";
import User, { type IUser, type UserStatus } from "@/models/User";

export const ACTIVE_USER_STATUS: UserStatus = "active";

export function normalizeLoginIdentifier(value: string) {
  return value.trim().toLowerCase();
}

export function isActiveUser(user: Pick<IUser, "status"> | null | undefined) {
  return !user?.status || user.status === ACTIVE_USER_STATUS;
}

export function isEnvAllowedGoogleEmail(email: string) {
  const allowed = process.env.ALLOWED_GOOGLE_EMAILS || "";
  if (!allowed.trim()) return false;
  return allowed
    .split(",")
    .map((entry) => normalizeLoginIdentifier(entry))
    .filter(Boolean)
    .includes(normalizeLoginIdentifier(email));
}

export function isEnvAdminEmail(email: string | null | undefined) {
  const adminEmail = getAdminEmail();
  return Boolean(adminEmail && email && normalizeLoginIdentifier(email) === adminEmail);
}

export async function isAdminSession(session: Session | null) {
  if (!session) return false;

  const email = session?.user?.email || "";
  if (isEnvAdminEmail(email)) return true;

  const userId = (session?.user as (typeof session.user & { id?: string }) | undefined)?.id;
  if (!userId) return false;

  await connectDB();
  const user = await User.findById(userId).select("role status");
  return Boolean(user && user.role === "admin" && isActiveUser(user));
}

export function getRequestIp(headers: Headers) {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    ""
  );
}
