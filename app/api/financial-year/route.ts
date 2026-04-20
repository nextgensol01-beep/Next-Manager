import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import FinancialYear from "@/models/FinancialYear";
import CreditTransaction from "@/models/CreditTransaction";
import type { ITargetEntry, IGeneratedEntry } from "@/models/FinancialYear";

// ── Helpers ────────────────────────────────────────────────────────────────

const g = (r: Record<string, unknown>, canonical: string, legacy: string): number =>
  Number(r[canonical] ?? r[legacy] ?? 0);

const VALID_TYPES = new Set(["RECYCLING", "EOL"]);
const CAT_KEYS = ["1", "2", "3", "4"] as const;

function normaliseEntries(raw: unknown[]): ITargetEntry[] {
  return raw
    .filter((t: unknown) => {
      const e = t as ITargetEntry;
      return e.categoryId && VALID_TYPES.has(e.type) && Number(e.value) >= 0;
    })
    .map((t: unknown) => {
      const e = t as ITargetEntry;
      return { categoryId: String(e.categoryId), type: e.type, value: Number(e.value) };
    });
}

function normaliseCreditType(type: unknown): "RECYCLING" | "EOL" {
  return String(type).toUpperCase() === "EOL" ? "EOL" : "RECYCLING";
}

function usageEntriesFromTotals(
  totals: Record<string, number> | undefined
): Array<{ categoryId: string; type: "RECYCLING" | "EOL"; value: number }> {
  if (!totals) return [];

  const entries: Array<{ categoryId: string; type: "RECYCLING" | "EOL"; value: number }> = [];
  for (const categoryId of CAT_KEYS) {
    for (const type of ["RECYCLING", "EOL"] as const) {
      const value = totals[`${categoryId}|${type}`] ?? 0;
      if (value > 0) {
        entries.push({ categoryId, type, value });
      }
    }
  }
  return entries;
}

/** Sum entries per category across ALL types → flat cat1…cat4 fields */
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

/** Migrate legacy flat cat1Generated…cat4Generated to generated[] — defaults RECYCLING */
function migrateGenerated(r: Record<string, unknown>): IGeneratedEntry[] {
  const existing = r.generated as IGeneratedEntry[] | undefined;
  if (Array.isArray(existing) && existing.length > 0) return existing;
  const entries: IGeneratedEntry[] = [];
  for (let i = 1; i <= 4; i++) {
    const val = Number(r[`cat${i}Generated`] ?? r[`creditsCat${i}`] ?? 0);
    if (val > 0) entries.push({ categoryId: String(i), type: "RECYCLING", value: val });
  }
  return entries;
}

/** Migrate legacy flat cat1Target…cat4Target to targets[] — defaults RECYCLING */
function migrateTargets(r: Record<string, unknown>): ITargetEntry[] {
  const existing = r.targets as ITargetEntry[] | undefined;
  if (Array.isArray(existing) && existing.length > 0) return existing;
  const entries: ITargetEntry[] = [];
  for (let i = 1; i <= 4; i++) {
    const val = Number(r[`cat${i}Target`] ?? r[`targetCat${i}`] ?? 0);
    if (val > 0) entries.push({ categoryId: String(i), type: "RECYCLING", value: val });
  }
  return entries;
}

// ── GET ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  const fy       = searchParams.get("fy");

  const query: Record<string, string> = {};
  if (clientId) query.clientId = clientId;
  if (fy)       query.financialYear = fy;

  const records = await FinancialYear.find(query).sort({ financialYear: -1 }).lean() as Record<string, unknown>[];
  if (records.length === 0) return NextResponse.json([]);

  const clientIds = [...new Set(records.map((r) => r.clientId as string))];
  const fys       = [...new Set(records.map((r) => r.financialYear as string))];

  const txAgg = await CreditTransaction.aggregate([
    {
      $match: {
        financialYear: { $in: fys },
        $or: [{ fromClientId: { $in: clientIds } }, { toClientId: { $in: clientIds } }],
      },
    },
    {
      $group: {
        _id: {
          fy: "$financialYear",
          from: "$fromClientId",
          to: "$toClientId",
          type: {
            $cond: [
              { $eq: [{ $toUpper: { $ifNull: ["$creditType", "RECYCLING"] } }, "EOL"] },
              "EOL",
              "RECYCLING",
            ],
          },
        },
        q1: { $sum: { $cond: [{ $gt: ["$cat1Qty", 0] }, "$cat1Qty", "$cat1"] } },
        q2: { $sum: { $cond: [{ $gt: ["$cat2Qty", 0] }, "$cat2Qty", "$cat2"] } },
        q3: { $sum: { $cond: [{ $gt: ["$cat3Qty", 0] }, "$cat3Qty", "$cat3"] } },
        q4: { $sum: { $cond: [{ $gt: ["$cat4Qty", 0] }, "$cat4Qty", "$cat4"] } },
      },
    },
  ]);

  type CatTotals = { c1: number; c2: number; c3: number; c4: number };
  const soldMap: Record<string, CatTotals> = {};
  const achMap:  Record<string, CatTotals> = {};
  const soldTypedMap: Record<string, Record<string, number>> = {};
  const achTypedMap: Record<string, Record<string, number>> = {};

  const addTypedTotals = (
    map: Record<string, Record<string, number>>,
    key: string,
    type: "RECYCLING" | "EOL",
    tx: { q1: number; q2: number; q3: number; q4: number }
  ) => {
    if (!map[key]) map[key] = {};
    map[key][`1|${type}`] = (map[key][`1|${type}`] ?? 0) + tx.q1;
    map[key][`2|${type}`] = (map[key][`2|${type}`] ?? 0) + tx.q2;
    map[key][`3|${type}`] = (map[key][`3|${type}`] ?? 0) + tx.q3;
    map[key][`4|${type}`] = (map[key][`4|${type}`] ?? 0) + tx.q4;
  };

  for (const tx of txAgg) {
    const { fy: tFy, from, to } = tx._id;
    const txType = normaliseCreditType(tx._id.type);
    if (from && clientIds.includes(from)) {
      const k = `${from}|${tFy}`;
      if (!soldMap[k]) soldMap[k] = { c1: 0, c2: 0, c3: 0, c4: 0 };
      soldMap[k].c1 += tx.q1; soldMap[k].c2 += tx.q2;
      soldMap[k].c3 += tx.q3; soldMap[k].c4 += tx.q4;
      addTypedTotals(soldTypedMap, k, txType, tx);
    }
    if (to && clientIds.includes(to)) {
      const k = `${to}|${tFy}`;
      if (!achMap[k]) achMap[k] = { c1: 0, c2: 0, c3: 0, c4: 0 };
      achMap[k].c1 += tx.q1; achMap[k].c2 += tx.q2;
      achMap[k].c3 += tx.q3; achMap[k].c4 += tx.q4;
      addTypedTotals(achTypedMap, k, txType, tx);
    }
  }

  const enriched = records.map((r) => {
    const k    = `${r.clientId}|${r.financialYear}`;
    const sold = soldMap[k] ?? { c1: 0, c2: 0, c3: 0, c4: 0 };
    const ach  = achMap[k]  ?? { c1: 0, c2: 0, c3: 0, c4: 0 };
    const soldByType = usageEntriesFromTotals(soldTypedMap[k]);
    const achievedByType = usageEntriesFromTotals(achTypedMap[k]);

    // Migrate and derive flat values for generated
    const migratedGenerated = migrateGenerated(r);
    const flatGen = deriveFlat(migratedGenerated, "cat");
    // Rename keys from "cat1" → "cat1Generated"
    const gen1 = flatGen.cat1 || g(r, "cat1Generated", "creditsCat1");
    const gen2 = flatGen.cat2 || g(r, "cat2Generated", "creditsCat2");
    const gen3 = flatGen.cat3 || g(r, "cat3Generated", "creditsCat3");
    const gen4 = flatGen.cat4 || g(r, "cat4Generated", "creditsCat4");

    // Migrate and derive flat values for targets
    const migratedTargets = migrateTargets(r);
    const flatTgt = deriveFlat(migratedTargets, "cat");
    const tgt1 = flatTgt.cat1 || g(r, "cat1Target", "targetCat1");
    const tgt2 = flatTgt.cat2 || g(r, "cat2Target", "targetCat2");
    const tgt3 = flatTgt.cat3 || g(r, "cat3Target", "targetCat3");
    const tgt4 = flatTgt.cat4 || g(r, "cat4Target", "targetCat4");

    const totalGenerated = gen1 + gen2 + gen3 + gen4;
    const totalSold      = sold.c1 + sold.c2 + sold.c3 + sold.c4;
    const totalTarget    = tgt1 + tgt2 + tgt3 + tgt4;
    const totalAchieved  = ach.c1 + ach.c2 + ach.c3 + ach.c4;

    return {
      ...r,
      generated: migratedGenerated,
      targets:   migratedTargets,
      cat1Generated: gen1, cat2Generated: gen2, cat3Generated: gen3, cat4Generated: gen4,
      cat1Target: tgt1,    cat2Target: tgt2,    cat3Target: tgt3,    cat4Target: tgt4,
      soldByType,
      achievedByType,
      soldCat1: sold.c1, soldCat2: sold.c2, soldCat3: sold.c3, soldCat4: sold.c4,
      remainingCat1: gen1 - sold.c1, remainingCat2: gen2 - sold.c2,
      remainingCat3: gen3 - sold.c3, remainingCat4: gen4 - sold.c4,
      achievedCat1: ach.c1, achievedCat2: ach.c2, achievedCat3: ach.c3, achievedCat4: ach.c4,
      remainingTargetCat1: tgt1 - ach.c1, remainingTargetCat2: tgt2 - ach.c2,
      remainingTargetCat3: tgt3 - ach.c3, remainingTargetCat4: tgt4 - ach.c4,
      totalGenerated, totalSold, totalRemaining: totalGenerated - totalSold,
      totalTarget,    totalAchieved, totalRemainingTarget: totalTarget - totalAchieved,
      totalCredits: totalGenerated, totalUsed: totalSold,
      remainingCredits: totalGenerated - totalSold,
      remainingTarget: totalTarget - totalAchieved,
      availableCredits: totalGenerated || Number(r.availableCredits ?? 0),
      targetAmount: totalTarget || Number(r.targetAmount ?? 0),
    };
  });

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("GET /api/financial-year:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
  await connectDB();
  const body = await req.json();

  // Normalise generated[]
  const generated: IGeneratedEntry[] = Array.isArray(body.generated)
    ? normaliseEntries(body.generated)
    : [];

  // Derive flat cat1Generated…cat4Generated (sum per cat across all types)
  const flatGen = deriveFlat(generated, "cat");

  // Normalise targets[]
  const targets: ITargetEntry[] = Array.isArray(body.targets)
    ? normaliseEntries(body.targets)
    : [];

  const flatTgt = deriveFlat(targets, "cat");
  // Rename flat keys to the expected field names
  const flatTgtRenamed = {
    cat1Target: flatTgt.cat1, cat2Target: flatTgt.cat2,
    cat3Target: flatTgt.cat3, cat4Target: flatTgt.cat4,
  };

  const payload = {
    clientId:      body.clientId,
    financialYear: body.financialYear,
    generated,
    cat1Generated: flatGen.cat1 ?? 0,
    cat2Generated: flatGen.cat2 ?? 0,
    cat3Generated: flatGen.cat3 ?? 0,
    cat4Generated: flatGen.cat4 ?? 0,
    targets,
    ...flatTgtRenamed,
  };

  const record = await FinancialYear.findOneAndUpdate(
    { clientId: payload.clientId, financialYear: payload.financialYear },
    payload,
    { upsert: true, new: true }
  );
  return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error("POST /api/financial-year:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
