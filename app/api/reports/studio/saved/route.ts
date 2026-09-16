import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/mongoose";
import { validateReportStudioConfig, type ReportStudioConfig, type ReportStudioFieldDefinition } from "@/lib/report-studio";
import { currentSessionUserObjectId } from "@/lib/server/current-session-user";
import { loadReportStudioCustomFields } from "@/lib/server/report-studio-fields";
import ReportStudioSavedReport from "@/models/ReportStudioSavedReport";

const MAX_SAVED_REPORTS = 100;

const singleReportSchema = z.object({
  name: z.string().trim().min(1, "Report name is required").max(120),
  config: z.unknown(),
  migrationKey: z.string().trim().min(1).max(160).optional(),
});

const bulkMigrationSchema = z.object({
  reports: z.array(singleReportSchema).max(MAX_SAVED_REPORTS),
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

function normalizedReport(value: unknown, customFields: ReportStudioFieldDefinition[]) {
  const parsed = singleReportSchema.parse(value);
  return {
    name: parsed.name,
    config: validateReportStudioConfig({ ...parsed.config as Record<string, unknown>, name: parsed.name }, customFields),
    migrationKey: parsed.migrationKey,
  };
}

async function listSavedReports(userId: NonNullable<Awaited<ReturnType<typeof currentSessionUserObjectId>>["userId"]>) {
  const records = await ReportStudioSavedReport.find({ userId })
    .sort({ updatedAt: -1 })
    .limit(MAX_SAVED_REPORTS)
    .lean() as SavedReportRecord[];
  return records.map(serializeSavedReport);
}

export async function GET() {
  const currentUser = await currentSessionUserObjectId();
  if (!currentUser.userId) return NextResponse.json({ error: currentUser.error }, { status: currentUser.status });
  await connectDB();
  return NextResponse.json({ reports: await listSavedReports(currentUser.userId), limit: MAX_SAVED_REPORTS });
}

export async function POST(req: NextRequest) {
  const currentUser = await currentSessionUserObjectId();
  if (!currentUser.userId) return NextResponse.json({ error: currentUser.error }, { status: currentUser.status });

  const body = await req.json().catch(() => null);
  await connectDB();

  try {
    const customFields = await loadReportStudioCustomFields();
    if (body && typeof body === "object" && "reports" in body) {
      const migration = bulkMigrationSchema.parse(body);
      const reports = migration.reports.map((report) => normalizedReport(report, customFields));
      const migrationKeys = reports.map((report) => report.migrationKey).filter((key): key is string => Boolean(key));
      if (migrationKeys.length !== reports.length || new Set(migrationKeys).size !== migrationKeys.length) {
        return NextResponse.json({ error: "Every migrated report must have a unique migration key" }, { status: 400 });
      }

      const existingCount = await ReportStudioSavedReport.countDocuments({ userId: currentUser.userId });
      const existingMigrated = migrationKeys.length > 0
        ? await ReportStudioSavedReport.countDocuments({ userId: currentUser.userId, migrationKey: { $in: migrationKeys } })
        : 0;
      if (existingCount + reports.length - existingMigrated > MAX_SAVED_REPORTS) {
        return NextResponse.json({ error: `You can save up to ${MAX_SAVED_REPORTS} Report Studio configurations.` }, { status: 409 });
      }

      if (reports.length > 0) {
        await ReportStudioSavedReport.bulkWrite(reports.map((report) => ({
          updateOne: {
            filter: { userId: currentUser.userId, migrationKey: report.migrationKey },
            update: { $setOnInsert: { userId: currentUser.userId, ...report } },
            upsert: true,
          },
        })));
      }

      return NextResponse.json({ reports: await listSavedReports(currentUser.userId), migrated: reports.length });
    }

    const report = normalizedReport(body, customFields);
    const count = await ReportStudioSavedReport.countDocuments({ userId: currentUser.userId });
    if (count >= MAX_SAVED_REPORTS) {
      return NextResponse.json({ error: `You can save up to ${MAX_SAVED_REPORTS} Report Studio configurations.` }, { status: 409 });
    }

    const savedReportId = new mongoose.Types.ObjectId();
    const created = await ReportStudioSavedReport.create({
      _id: savedReportId,
      userId: currentUser.userId,
      name: report.name,
      config: report.config,
      // A compound sparse index still indexes this document because userId is
      // present. Give native saves a key so multiple reports do not collide on null.
      migrationKey: `saved:${savedReportId.toHexString()}`,
    });
    return NextResponse.json({ report: serializeSavedReport(created.toObject()) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: validationMessage(error) }, { status: 400 });
  }
}
