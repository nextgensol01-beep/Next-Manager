import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import mongoose from "mongoose";
import { authOptions } from "@/lib/auth";

function sessionUserId(session: Session | null) {
  return (session?.user as (Session["user"] & { id?: string }) | undefined)?.id || "";
}

export async function currentSessionUserObjectId() {
  const session = await getServerSession(authOptions);
  if (!session) return { status: 401 as const, error: "Unauthorized", userId: null };
  const rawUserId = sessionUserId(session);
  if (!rawUserId) return { status: 403 as const, error: "User id missing from session", userId: null };
  if (!mongoose.Types.ObjectId.isValid(rawUserId)) return { status: 400 as const, error: "Invalid user id", userId: null };
  return { status: 200 as const, error: "", userId: new mongoose.Types.ObjectId(rawUserId) };
}
