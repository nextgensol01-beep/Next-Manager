import { z } from "zod";

export const manualReportFieldSchema = z.object({
  label: z.string().trim().min(1).max(100),
  scope: z.enum(["client", "financial-year"]),
  type: z.enum(["boolean", "select", "text", "number", "date"]),
  options: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
}).strict().refine(field => field.type === "select" ? field.options.length > 0 && new Set(field.options).size === field.options.length : field.options.length === 0, "Enter unique options for a dropdown.");

export type ReportManualField = z.infer<typeof manualReportFieldSchema> & { id: string };
export const manualFieldId = (id: string) => `manual.${id}`;
export const hasManualReportFields = (value: unknown) => /"manual\.[a-f\d]{24}"/i.test(JSON.stringify(value));
