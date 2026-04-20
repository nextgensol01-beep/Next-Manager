import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import { buildCustomClientExportData } from "@/lib/server/custom-client-export";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await connectDB();
    const body = await req.json();
    const result = await buildCustomClientExportData(body);
    return NextResponse.json({
      fy: result.fy,
      fields: result.fields,
      previewColumns: result.previewColumns,
      summary: result.summary,
    });
  } catch (error) {
    console.error("POST /api/reports/custom-export/preview:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Select at least one") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
