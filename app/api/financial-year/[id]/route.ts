import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import FinancialYear from "@/models/FinancialYear";
import DeletedRecord from "@/models/DeletedRecord";
import { normaliseEntries, deriveFlat, validateReviewedTargetImport } from "@/lib/server/financial-year-entry-validation";
import { recordActivityEvent } from "@/lib/server/activity-events";


export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
  await connectDB();
  const body = await req.json();
  const { id } = await params;

  const guarded = Object.prototype.hasOwnProperty.call(body, "expectedUpdatedAt");
  let expectedDate: Date | null = null;
  if (guarded) {
    if (!body.clientId || !body.financialYear) return NextResponse.json({ error: "Client and financial year are required." }, { status: 400 });
    if (body.expectedUpdatedAt !== null) {
      expectedDate = new Date(body.expectedUpdatedAt);
      if (Number.isNaN(expectedDate.getTime())) return NextResponse.json({ error: "The record revision is invalid. Reload it before saving." }, { status: 400 });
    }
    for (const entries of [body.targets, body.generated]) {
      const error = validateReviewedTargetImport(entries);
      if (error) return NextResponse.json({ error }, { status: 400 });
    }
  }

  if (body.targetImportReviewConfirmed === true) {
    const validationError = validateReviewedTargetImport(body.targets);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  }

  let update = { ...body };
  delete update.targetImportReviewConfirmed;
  delete update.expectedUpdatedAt;

  if (Array.isArray(body.generated)) {
    const generated = normaliseEntries(body.generated);
    const flatGen = deriveFlat(generated, "cat");
    update = {
      ...update,
      generated,
      cat1Generated: flatGen.cat1 ?? 0,
      cat2Generated: flatGen.cat2 ?? 0,
      cat3Generated: flatGen.cat3 ?? 0,
      cat4Generated: flatGen.cat4 ?? 0,
    };
  }

  if (Array.isArray(body.targets)) {
    const targets = normaliseEntries(body.targets);
    const flatTgt = deriveFlat(targets, "cat");
    update = {
      ...update,
      targets,
      cat1Target: flatTgt.cat1 ?? 0,
      cat2Target: flatTgt.cat2 ?? 0,
      cat3Target: flatTgt.cat3 ?? 0,
      cat4Target: flatTgt.cat4 ?? 0,
    };
  }

  const record = guarded ? await FinancialYear.findOneAndUpdate({ _id: id, clientId: body.clientId, financialYear: body.financialYear,
    updatedAt: expectedDate || { $exists: false } }, { $set: update }, { new: true, runValidators: true })
    : await FinancialYear.findByIdAndUpdate(id, update, { new: true });
  if (guarded && !record) return NextResponse.json({ error: "This FY record changed or was removed while you were editing. Reload the current record before saving." }, { status: 409 });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (guarded) await recordActivityEvent({ clientId: record.clientId, category: "compliance", type: "fy_data_updated", label: "FY Data Updated",
    detail: `FY ${record.financialYear} · category and type quantities updated`, color: "violet", badge: "Updated",
    badgeColor: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300", financialYear: record.financialYear,
    entityId: String(record._id), entityType: "financial-year", relatedEntityIds: [String(record._id)] }, session);
  return NextResponse.json(record);
  } catch (error) {
    console.error("PUT /api/financial-year/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
  await connectDB();
  const { id } = await params;
  const record = await FinancialYear.findById(id);
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await DeletedRecord.create({
    recordType: "financialYear",
    recordId: id,
    label: `Financial Year — ${record.clientId}`,
    subLabel: `FY ${record.financialYear}`,
    data: record.toObject(),
  });
  await FinancialYear.findByIdAndDelete(id);
  return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/financial-year/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
