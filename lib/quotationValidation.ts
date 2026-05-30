import { z } from "zod";
import { GST_PERCENT_OPTIONS, QUOTATION_STATUSES } from "@/lib/quotationRules";

const emptyToUndefined = (value: unknown) => value === "" ? undefined : value;
const optionalText = z.preprocess(emptyToUndefined, z.string().trim().max(500).optional());
const money = z.coerce.number().finite().min(0);
const positiveDays = z.coerce.number().int().min(1).max(365);

export const mongoObjectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid id");

export const quotationStatusSchema = z.enum(QUOTATION_STATUSES);

export const quotationFinancialYearSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}$/, "Use FY format YYYY-YY");

export const quotationGstPercentSchema = z
  .coerce
  .number()
  .finite()
  .refine((value) => GST_PERCENT_OPTIONS.includes(value as typeof GST_PERCENT_OPTIONS[number]), {
    message: "Unsupported GST percentage",
  });

export const quotationItemSchema = z.object({
  description: z.string().trim().min(1, "Description is required").max(200),
  category: z.string().trim().min(1, "Category is required").max(40),
  type: z.string().trim().min(1, "Type is required").max(60),
  quantity: money,
  rate: money,
  gstPercent: quotationGstPercentSchema,
});

export const quotationCreateSchema = z.object({
  clientName: z.string().trim().min(1, "Client name is required").max(200),
  clientId: optionalText,
  clientAddress: optionalText,
  clientGst: optionalText,
  clientState: optionalText,
  financialYear: quotationFinancialYearSchema,
  items: z.array(quotationItemSchema).default([]),
  consultationCharges: money.default(0),
  consultationGstPercent: quotationGstPercentSchema.default(18),
  governmentFees: money.default(0),
  notes: z.string().max(2000).default(""),
  validityDays: positiveDays.default(30),
}).strict();

export const quotationPatchSchema = z.object({
  status: quotationStatusSchema.optional(),
  clientName: z.string().trim().min(1).max(200).optional(),
  clientId: optionalText,
  clientAddress: optionalText,
  clientGst: optionalText,
  clientState: optionalText,
  financialYear: quotationFinancialYearSchema.optional(),
  validityDays: positiveDays.optional(),
  items: z.array(quotationItemSchema).optional(),
  consultationCharges: money.optional(),
  consultationGstPercent: quotationGstPercentSchema.optional(),
  governmentFees: money.optional(),
  notes: z.string().max(2000).optional(),
  activityEntry: z.object({
    action: z.string().trim().min(1).max(120),
    detail: z.string().trim().max(300).optional(),
  }).optional(),
}).strict();

export const quotationListQuerySchema = z.object({
  status: z.union([quotationStatusSchema, z.literal("all"), z.literal("awaitingResponse")]).default("all"),
  financialYear: z.union([quotationFinancialYearSchema, z.literal("all")]).default("all"),
  search: z.string().trim().max(120).default(""),
}).strict();

export const quotationStatusPatchSchema = z.object({
  status: quotationStatusSchema,
  reason: z.string().trim().max(300).default(""),
}).strict();

export function validationErrorMessage(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join("; ") || "Invalid request";
}
