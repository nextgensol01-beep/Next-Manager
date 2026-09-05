import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import FinancialYear from "@/models/FinancialYear";
import DeletedRecord from "@/models/DeletedRecord";
import type { ITargetEntry } from "@/models/FinancialYear";
import { validateReviewedTargetImport } from "@/lib/server/financial-year-entry-validation";

const VALID_TYPES = new Set(["RECYCLING", "EOL"]);
const CAT_KEYS = ["1", "2", "3", "4"] as const;

function normaliseEntries(raw: unknown[]): ITargetEntry[] {
  const entries = new Map<string, ITargetEntry>();

  for (const item of raw) {
    const entry = item as Partial<ITargetEntry>;
    const categoryId = String(entry.categoryId ?? "");
    const rawType = String(entry.type ?? "").toUpperCase();
    const type = VALID_TYPES.has(rawType) ? rawType as ITargetEntry["type"] : null;
    const value = Number(entry.value);

    if (!(CAT_KEYS as readonly string[]).includes(categoryId) || !type || !Number.isFinite(value) || value <= 0) {
      continue;
    }

    const key = `${categoryId}|${type}`;
    const existing = entries.get(key);
    entries.set(key, {
      categoryId,
      type,
      value: (existing?.value ?? 0) + value,
    });
  }

  return Array.from(entries.values());
}

function deriveFlat(entries: ITargetEntry[], prefix: string): Record<string, number> {
  const flat: Record<string, number> = {
    [`${prefix}1`]: 0, [`${prefix}2`]: 0, [`${prefix}3`]: 0, [`${prefix}4`]: 0,
  };
  for (const e of entries) {
    const k = `${prefix}${e.categoryId}`;
    flat[k] = (flat[k] ?? 0) + e.value;
  }
  return flat;
}

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

  if (body.targetImportReviewConfirmed === true) {
    const validationError = validateReviewedTargetImport(body.targets);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  }

  let update = { ...body };
  delete update.targetImportReviewConfirmed;

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

  const record = await FinancialYear.findByIdAndUpdate(id, update, { new: true });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
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
