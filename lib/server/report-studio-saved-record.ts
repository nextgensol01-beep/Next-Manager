import { z } from "zod";
import type { ReportStudioConfig } from "@/lib/report-studio";

export type SavedReportRecord = {
  _id?: unknown;
  name?: unknown;
  config?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export function serializeSavedReport(record: SavedReportRecord) {
  return {
    id: String(record._id || ""),
    name: String(record.name || ""),
    config: record.config as ReportStudioConfig,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function validationMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues.map((issue) => issue.message).join("; ");
  return error instanceof Error ? error.message : "Invalid saved report configuration";
}
