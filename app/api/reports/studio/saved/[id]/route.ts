import { serializeSavedReport, validationMessage, type SavedReportRecord } from "@/lib/server/report-studio-saved-record";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/mongoose";
import { validateReportStudioConfig } from "@/lib/report-studio";
import { currentSessionUserObjectId } from "@/lib/server/current-session-user";
import { loadReportStudioCustomFields } from "@/lib/server/report-studio-fields";
import { hasManualReportFields } from "@/lib/report-manual";
import ReportStudioSavedReport from "@/models/ReportStudioSavedReport";

const updateReportSchema = z.object({
  name: z.string().trim().min(1, "Report name is required").max(120),
  config: z.unknown(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await currentSessionUserObjectId();
  if (!currentUser.userId) return NextResponse.json({ error: currentUser.error }, { status: currentUser.status });
  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Saved report not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  try {
    const parsed = updateReportSchema.parse(body);
    await connectDB();
    const customFields = await loadReportStudioCustomFields(hasManualReportFields(body));
    const config = validateReportStudioConfig({
      ...parsed.config as Record<string, unknown>,
      name: parsed.name,
    }, customFields);

    const updated = await ReportStudioSavedReport.findOneAndUpdate(
      { _id: id, userId: currentUser.userId },
      { $set: { name: parsed.name, config } },
      { new: true, runValidators: true },
    ).lean() as SavedReportRecord | null;
    if (!updated) return NextResponse.json({ error: "Saved report not found" }, { status: 404 });
    return NextResponse.json({ report: serializeSavedReport(updated) });
  } catch (error) {
    return NextResponse.json({ error: validationMessage(error) }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await currentSessionUserObjectId();
  if (!currentUser.userId) return NextResponse.json({ error: currentUser.error }, { status: currentUser.status });
  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Saved report not found" }, { status: 404 });

  await connectDB();
  const deleted = await ReportStudioSavedReport.findOneAndDelete({ _id: id, userId: currentUser.userId });
  if (!deleted) return NextResponse.json({ error: "Saved report not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
