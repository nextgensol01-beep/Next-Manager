import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/mongoose";
import { currentSessionUserObjectId } from "@/lib/server/current-session-user";
import { CUSTOM_EXPORT_CLIENT_CATEGORIES, isSafeCustomExportField } from "@/lib/reports";
import CustomExportPreset from "@/models/CustomExportPreset";

const presetSchema = z.object({
  name: z.string().trim().min(1).max(120),
  migrationKey: z.string().min(1).max(160).optional(),
  config: z.object({
    fields: z.array(z.string().min(1).max(120).refine(isSafeCustomExportField, "Select safe export fields")).min(1).max(200),
    fy: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    categories: z.array(z.enum(CUSTOM_EXPORT_CLIENT_CATEGORIES)).optional(),
    clientIds: z.array(z.string().max(120)).max(10000).optional(),
    dateFrom: z.string().max(10).optional(), dateTo: z.string().max(10).optional(),
    includeOnlyNonEmpty: z.boolean().optional(),
    sortBy: z.enum(["companyName", "category", "state", "fyBillingTotal", "fyPendingAmount", "latestActivity", "createdAt"]).optional(),
  }),
});
const serialize = (record: Record<string, unknown>) => ({ id: String(record._id), name: record.name, config: record.config, description: "Saved to your account" });
async function list(userId: mongoose.Types.ObjectId) {
  const records = await CustomExportPreset.find({ userId }).sort({ updatedAt: -1 }).limit(100).lean();
  return records.map((record) => serialize(record as Record<string, unknown>));
}
export async function GET() {
  const user = await currentSessionUserObjectId();
  if (!user.userId) return NextResponse.json({ error: user.error }, { status: user.status });
  await connectDB();
  return NextResponse.json({ presets: await list(user.userId) }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: NextRequest) {
  const user = await currentSessionUserObjectId();
  if (!user.userId) return NextResponse.json({ error: user.error }, { status: user.status });
  try {
    const body = await request.json();
    const presets = z.array(presetSchema).min(1).max(100).parse(body.presets || [body]);
    await connectDB();
    const count = await CustomExportPreset.countDocuments({ userId: user.userId });
    const keys = presets.map((entry) => entry.migrationKey).filter(Boolean);
    const existing = keys.length ? await CustomExportPreset.countDocuments({ userId: user.userId, migrationKey: { $in: keys } }) : 0;
    if (count + presets.length - existing > 100) return NextResponse.json({ error: "You can save up to 100 export presets." }, { status: 409 });
    for (const preset of presets) {
      if (preset.migrationKey) await CustomExportPreset.updateOne({ userId: user.userId, migrationKey: preset.migrationKey }, { $setOnInsert: { userId: user.userId, ...preset } }, { upsert: true });
      else await CustomExportPreset.create({ userId: user.userId, ...preset });
    }
    return NextResponse.json({ presets: await list(user.userId) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? error.issues.map((issue) => issue.message).join("; ") : "Could not save the export preset. Try again." }, { status: 400 });
  }
}
export async function DELETE(request: NextRequest) {
  const user = await currentSessionUserObjectId();
  if (!user.userId) return NextResponse.json({ error: user.error }, { status: user.status });
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid preset" }, { status: 400 });
  await connectDB();
  await CustomExportPreset.deleteOne({ _id: id, userId: user.userId });
  return NextResponse.json({ presets: await list(user.userId) });
}
