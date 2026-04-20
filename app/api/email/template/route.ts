import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PAYMENT_REMINDER, ANNUAL_RETURN_CONFIRMATION } from "@/lib/templates";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name") || "payment-reminder";
    const templates: Record<string, string> = {
      "payment-reminder": PAYMENT_REMINDER,
      "annual-return-confirmation": ANNUAL_RETURN_CONFIRMATION,
    };
    const html = templates[name];
    if (!html) return NextResponse.json({ error: "Unknown template" }, { status: 400 });
    return NextResponse.json({ html });
  } catch (error) {
    console.error("GET /api/email/template:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
