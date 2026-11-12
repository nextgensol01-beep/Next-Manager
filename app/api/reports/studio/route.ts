import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { errorResponse, requireSession } from "@/lib/route-utils";
import { executeReportStudio } from "@/lib/server/report-studio-service";
import { executeBillingReport, assignBillingCategory } from "@/lib/server/billing-report-service";
import { ZodError } from "zod";
import { isAdminSession } from "@/lib/authUsers";
import { isRestrictedReportSource } from "@/lib/report-datasets";

export async function POST(request: NextRequest) {
  const guard = await requireSession();
  if (guard.response) return guard.response;
  try {
    await connectDB();
    const body = await request.json();
    if (isRestrictedReportSource(body?.source) && !await isAdminSession(guard.session)) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    if (body?.mode === "billing-report") return NextResponse.json(await executeBillingReport(body.report));
    if (body?.mode === "billing-category") {
      const expected = new URL(process.env.NEXTAUTH_URL || request.url).origin;
      if (request.headers.get("origin") !== expected) return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
      if (!guard.actor?.id) return NextResponse.json({ error: "User id missing from session" }, { status: 403 });
      return NextResponse.json(await assignBillingCategory(body.assignment, guard.actor.id));
    }
    return NextResponse.json(await executeReportStudio(body));
  } catch (error) {
    return errorResponse(error, "Unable to run Report Studio", error instanceof ZodError || error instanceof Error && /Field|Operator|Invalid|expected|Component changed/i.test(error.message) ? 400 : 500);
  }
}

