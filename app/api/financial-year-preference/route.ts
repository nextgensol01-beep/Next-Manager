import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import mongoose from "mongoose";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import { CURRENT_FY, FINANCIAL_YEARS } from "@/lib/utils";
import User, { type IUserFinancialYearSettings } from "@/models/User";

const DEFAULT_SETTINGS: IUserFinancialYearSettings = {
  enabled: false,
  defaultFinancialYear: null,
  lastKnownCurrentFy: null,
  pendingReminderCurrentFy: null,
};

function getSessionUserId(session: Session | null) {
  return (session?.user as (Session["user"] & { id?: string }) | undefined)?.id || "";
}

function getUserObjectId(userId: string) {
  return mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null;
}

function isValidFinancialYear(financialYear: unknown): financialYear is string {
  return typeof financialYear === "string" && FINANCIAL_YEARS.includes(financialYear);
}

function normalizeSettings(value: unknown): IUserFinancialYearSettings {
  const source = value && typeof value === "object"
    ? value as Partial<IUserFinancialYearSettings>
    : {};
  const enabled = Boolean(source.enabled);
  const defaultFinancialYear = isValidFinancialYear(source.defaultFinancialYear)
    ? source.defaultFinancialYear
    : null;
  const lastKnownCurrentFy = isValidFinancialYear(source.lastKnownCurrentFy)
    ? source.lastKnownCurrentFy
    : null;
  let pendingReminderCurrentFy = isValidFinancialYear(source.pendingReminderCurrentFy)
    ? source.pendingReminderCurrentFy
    : null;

  if (!enabled || !defaultFinancialYear || defaultFinancialYear === CURRENT_FY) {
    pendingReminderCurrentFy = null;
  }

  return {
    enabled,
    defaultFinancialYear,
    lastKnownCurrentFy,
    pendingReminderCurrentFy,
  };
}

async function requireCurrentUser() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return {
      userId: "",
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const userId = getSessionUserId(session);
  if (!userId) {
    return {
      userId: "",
      response: NextResponse.json({ error: "User id missing from session" }, { status: 403 }),
    };
  }

  return { userId, response: null };
}

export async function GET() {
  const guard = await requireCurrentUser();
  if (guard.response) return guard.response;
  const userObjectId = getUserObjectId(guard.userId);
  if (!userObjectId) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }

  await connectDB();
  const user = await User.collection.findOne(
    { _id: userObjectId },
    { projection: { financialYearSettings: 1 } }
  ) as {
    financialYearSettings?: IUserFinancialYearSettings | null;
  } | null;

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    settings: normalizeSettings(user.financialYearSettings || DEFAULT_SETTINGS),
  });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireCurrentUser();
  if (guard.response) return guard.response;
  const userObjectId = getUserObjectId(guard.userId);
  if (!userObjectId) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const settings = body?.settings ?? body;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return NextResponse.json({ error: "Settings are required" }, { status: 400 });
  }
  // Patch only fields explicitly supplied. Missing or invalid data must never
  // become a disabled override or erase a previously saved financial year.
  const fields = ["enabled", "defaultFinancialYear", "lastKnownCurrentFy", "pendingReminderCurrentFy"] as const;
  const updates: Record<string, boolean | string | null> = {};
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(settings, field)) continue;
    const value = settings[field];
    if (field === "enabled" ? typeof value !== "boolean" : value !== null && !isValidFinancialYear(value)) {
      return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
    }
    updates[`financialYearSettings.${field}`] = value;
  }
  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: "No valid settings supplied" }, { status: 400 });
  }
  if (settings.enabled === false || settings.defaultFinancialYear === null || settings.defaultFinancialYear === CURRENT_FY) {
    updates["financialYearSettings.pendingReminderCurrentFy"] = null;
  }

  await connectDB();
  const user = await User.collection.findOneAndUpdate(
    { _id: userObjectId },
    { $set: updates },
    { returnDocument: "after", projection: { financialYearSettings: 1 } }
  ) as {
    financialYearSettings?: IUserFinancialYearSettings | null;
  } | null;

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    settings: normalizeSettings(user.financialYearSettings || DEFAULT_SETTINGS),
  });
}
