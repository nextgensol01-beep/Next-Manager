import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/mongoose";
import { validateReportStudioConfig, type ReportStudioConfig } from "@/lib/report-studio";
import { currentSessionUserObjectId } from "@/lib/server/current-session-user";
import { loadReportStudioCustomFields } from "@/lib/server/report-studio-fields";
import ReportStudioSavedReport from "@/models/ReportStudioSavedReport";

const updateReportSchema = z.object({
  name: z.string().trim().min(1, "Report name is required").max(120),
  config: z.unknown(),
});

type SavedReportRecord = {
  _id?: unknown;
  name?: unknown;
  config?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

function serializeSavedReport(record: SavedReportRecord) {
  return {
    id: String(record._id || ""),
    name: String(record.name || ""),
    config: record.config as ReportStudioConfig,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function validationMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues.map((issue) => issue.message).join("; ");
  return error instanceof Error ? error.message : "Invalid saved report configuration";
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await currentSessionUserObjectId();
  if (!currentUser.userId) return NextResponse.json({ error: currentUser.error }, { status: currentUser.status });
  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Saved report not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  try {
    const parsed = updateReportSchema.parse(body);
    await connectDB();
    const customFields = await loadReportStudioCustomFields();
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
