import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { errorResponse, requireSession } from "@/lib/route-utils";
import { executeReportStudio } from "@/lib/server/report-studio-service";

export async function POST(request: NextRequest) {
  const guard = await requireSession();
  if (guard.response) return guard.response;
  try {
    await connectDB();
    return NextResponse.json(await executeReportStudio(await request.json()));
  } catch (error) {
    return errorResponse(error, "Unable to run Report Studio", error instanceof Error && /Field|Operator|Invalid|expected/i.test(error.message) ? 400 : 500);
  }
}

