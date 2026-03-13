import { NextResponse } from "next/server";

export async function GET() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  return NextResponse.json({
    ADMIN_EMAIL_set: !!adminEmail,
    ADMIN_EMAIL_value: adminEmail || "NOT SET",
    ADMIN_PASSWORD_set: !!adminPassword,
    ADMIN_PASSWORD_length: adminPassword?.length || 0,
    ready: !!adminEmail && !!adminPassword,
  });
}
