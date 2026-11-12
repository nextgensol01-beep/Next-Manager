import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/route-utils";
import { isAdminSession } from "@/lib/authUsers";
import { connectDB } from "@/lib/mongoose";
import { loadManualReportFields, serializeManualField } from "@/lib/server/report-manual-data";
import { manualReportFieldSchema, type ReportManualField } from "@/lib/report-manual";
import { ReportManualFieldModel, ReportManualValueModel } from "@/models/ReportManualData";
import Client from "@/models/Client";

const valueKey = z.object({ fieldId: z.string().regex(/^[a-f\d]{24}$/i), clientId: z.string().trim().min(1).max(100), financialYear: z.string().regex(/^\d{4}-\d{2}$/) });
const valueInput = valueKey.extend({ value: z.union([z.string().trim().max(1000), z.boolean(), z.number().finite(), z.null()]) }).strict();
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

async function scopedValue(input: z.infer<typeof valueKey>) {
  const [field, client] = await Promise.all([
    ReportManualFieldModel.findById(input.fieldId).lean<ReportManualField | null>(),
    Client.exists({ clientId: input.clientId }),
  ]);
  if (!field || !client) return null;
  return { field, key: { fieldId: input.fieldId, clientId: input.clientId, financialYear: field.scope === "client" ? "" : input.financialYear } };
}

export async function GET(request: NextRequest) {
  const guard = await requireSession();
  if (guard.response) return guard.response;
  await connectDB();
  if (!request.nextUrl.searchParams.has("fieldId")) return json({ fields: await loadManualReportFields(), canEdit: await isAdminSession(guard.session) });
  const input = valueKey.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!input.success) return json({ error: "Select a valid field, client and FY." }, 400);
  const scope = await scopedValue(input.data);
  if (!scope) return json({ error: "Client or manual field was not found." }, 404);
  const record = await ReportManualValueModel.findOne(scope.key).select("value").lean<{ value: unknown } | null>();
  return json({ value: record?.value ?? null });
}

async function change(request: NextRequest, editValue: boolean) {
  const guard = await requireSession();
  if (guard.response) return guard.response;
  if (!guard.actor?.id || !await isAdminSession(guard.session)) return json({ error: "Administrator access required." }, 403);
  if (request.headers.get("origin") !== new URL(process.env.NEXTAUTH_URL || request.url).origin) return json({ error: "Invalid request origin." }, 403);
  const body = await request.json().catch(() => null);
  await connectDB();
  if (!editValue) {
    const input = manualReportFieldSchema.safeParse(body);
    if (!input.success) return json({ error: "Enter a label, scope, type and valid options." }, 400);
    if (await ReportManualFieldModel.countDocuments({}) >= 100) return json({ error: "The workspace can store up to 100 manual report fields." }, 409);
    const row = await ReportManualFieldModel.create({ ...input.data, createdBy: guard.actor.id });
    return json({ field: serializeManualField(row.toObject()) }, 201);
  }
  const input = valueInput.safeParse(body);
  if (!input.success) return json({ error: "Select a valid field, client, FY and value." }, 400);
  const scope = await scopedValue(input.data);
  if (!scope) return json({ error: "Client or manual field was not found." }, 404);
  const { value } = input.data;
  const { type, options } = scope.field;
  const valid = value === null || (type === "boolean" ? typeof value === "boolean" : type === "number" ? typeof value === "number" : typeof value === "string" &&
    (type === "select" ? options.includes(value) : type !== "date" || /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value).toJSON()?.slice(0, 10) === value));
  if (!valid) return json({ error: "Enter a value that matches the field type." }, 400);
  await ReportManualValueModel.init();
  await ReportManualValueModel.updateOne(scope.key, { $set: { value, updatedBy: guard.actor.id } }, { upsert: true });
  return json({ value });
}

export const POST = (request: NextRequest) => change(request, false);
export const PATCH = (request: NextRequest) => change(request, true);
